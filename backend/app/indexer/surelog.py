"""Surelog Indexer: builds the Symbol Cache's `WorkspaceIndex`.

Only ever runs on project open/reload, file added/removed, or an explicit
`POST /reindex` -- never on every keystroke (see `app/api/reindex.py`).

Two things happen on every index pass:

1. Surelog itself (`-parse`) elaborates the design to catch real syntax/
   semantic errors -- these are recorded in `WorkspaceIndex.errors`. If the
   `surelog` binary is missing or fails to launch, that's recorded as a
   single error entry rather than raising -- indexing still proceeds with
   step 2 below, so `/symbols` and `/hierarchy` keep working even on a host
   that hasn't got Surelog installed.
2. A lightweight, dependency-free text scan of the same files builds the
   actual `ModuleSymbol`/`PackageSymbol`/`InstanceNode` cache entries. This
   is a deliberate MVP tradeoff: full semantic extraction belongs on top of
   Surelog's UHDM output, which needs the `pyuhdm` bindings (not part of
   this MVP's dependency list). Swapping in real UHDM-based extraction later
   only means rewriting `_scan_file` below -- every other component reads
   `WorkspaceIndex`, not Surelog's output, so nothing else changes.
"""

import asyncio
import re

from app.models.symbol import (
    FunctionSymbol,
    InstanceNode,
    ModuleSymbol,
    PackageSymbol,
    Parameter,
    Port,
    Signal,
    SourceLocation,
    WorkspaceIndex,
)
from app.utils.logger import get_logger

logger = get_logger(__name__)

_KEYWORDS = {
    "if", "else", "for", "case", "casex", "casez", "endcase", "always", "always_comb",
    "always_ff", "always_latch", "initial", "final", "assign", "begin", "end", "function",
    "endfunction", "task", "endtask", "module", "endmodule", "generate", "endgenerate",
    "wire", "reg", "logic", "input", "output", "inout", "parameter", "localparam",
    "typedef", "struct", "enum", "class", "endclass", "interface", "endinterface",
    "package", "endpackage", "import", "export", "genvar", "real", "integer", "bit",
    "byte", "shortint", "longint", "int", "string", "void", "time", "automatic", "static",
    "return", "while", "repeat", "forever", "fork", "join", "join_any", "join_none",
    "disable", "force", "release", "default", "unique", "priority", "cover", "assert",
    "assume", "property", "endproperty", "sequence", "endsequence", "covergroup",
    "endgroup", "program", "endprogram", "specify", "endspecify", "posedge", "negedge",
}

_MODULE_HEADER_RE = re.compile(r"\bmodule\s+(\w+)")
_ENDMODULE_RE = re.compile(r"\bendmodule\b")
_PACKAGE_HEADER_RE = re.compile(r"\bpackage\s+(\w+)\s*;")
_ENDPACKAGE_RE = re.compile(r"\bendpackage\b")
_FUNC_TASK_RE = re.compile(r"\b(function|task)\b(?:\s+automatic)?")
_ENDFUNC_TASK_RE = {"function": re.compile(r"\bendfunction\b"), "task": re.compile(r"\bendtask\b")}
_PARAM_DECL_RE = re.compile(r"\b(parameter|localparam)\b")
_SIGNAL_DECL_RE = re.compile(r"^\s*(wire|reg|logic)\b(.*);", re.MULTILINE)
# Heuristic instance detection: "<module_type> [#(params)] <instance_name> (" --
# only matches when both identifiers are present and `type` isn't a keyword,
# which excludes control constructs (if/case/always/...) and data declarations.
_INSTANCE_RE = re.compile(
    r"(?<![\w$])(?P<type>[A-Za-z_]\w*)\s+"
    r"(?:#\s*\((?:[^()]|\([^()]*\))*\)\s*)?"
    r"(?P<inst>[A-Za-z_]\w*)\s*\("
)


class SurelogIndexer:
    """Runs Surelog for validation and a regex-based scan for symbol/hierarchy data."""

    def __init__(self, command: str, timeout: int) -> None:
        self._command = command
        self._timeout = timeout

    async def index(self, workspace_dir: str, files: list[str]) -> WorkspaceIndex:
        errors = await self._run_surelog(workspace_dir, files)

        modules: dict[str, ModuleSymbol] = {}
        packages: dict[str, PackageSymbol] = {}
        instances_by_module: dict[str, list[InstanceNode]] = {}

        for relative_path in files:
            try:
                with open(f"{workspace_dir}/{relative_path}", encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except OSError as exc:
                errors.append(f"{relative_path}: could not read file ({exc})")
                continue

            try:
                self._scan_file(relative_path, text, modules, packages, instances_by_module)
            except Exception as exc:  # noqa: BLE001 -- a bad regex match must never abort indexing
                logger.warning("Symbol scan failed for %s: %s", relative_path, exc)
                errors.append(f"{relative_path}: symbol scan failed ({exc})")

        instance_tree = self._build_instance_tree(modules, instances_by_module)
        return WorkspaceIndex(
            project_id="",  # filled in by the caller (indexer has no project-id context of its own)
            modules=modules,
            packages=packages,
            instance_tree=instance_tree,
            errors=errors,
        )

    async def _run_surelog(self, workspace_dir: str, files: list[str]) -> list[str]:
        if not files:
            return []
        args = [self._command, "-parse", "-mt", "1", *files]
        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=workspace_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (OSError, FileNotFoundError) as exc:
            return [f"surelog unavailable: {exc}"]

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=self._timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return [f"surelog timed out after {self._timeout}s"]

        output = (stdout + b"\n" + stderr).decode("utf-8", errors="replace")
        return [line.strip() for line in output.splitlines() if re.search(r"\berror\b", line, re.IGNORECASE)]

    # -- text scanning ---------------------------------------------------

    def _scan_file(
        self,
        relative_path: str,
        text: str,
        modules: dict[str, ModuleSymbol],
        packages: dict[str, PackageSymbol],
        instances_by_module: dict[str, list[InstanceNode]],
    ) -> None:
        stripped = _strip_comments(text)

        for match in _MODULE_HEADER_RE.finditer(stripped):
            name = match.group(1)
            end_match = _ENDMODULE_RE.search(stripped, match.end())
            body_end = end_match.start() if end_match else len(stripped)
            header_end = self._header_end(stripped, match.end())
            params_text, ports_text = self._extract_header(stripped, match.end())
            body = stripped[header_end:body_end]

            module = ModuleSymbol(
                name=name,
                location=_location(relative_path, stripped, match.start()),
                ports=_parse_ports(ports_text),
                parameters=_parse_params(params_text, relative_path, stripped, match.end()),
                signals=_parse_signals(body, relative_path, stripped, header_end),
                functions=_parse_functions(body, relative_path, stripped, header_end),
            )
            modules[name] = module
            instances_by_module[name] = _parse_instances(
                _strip_function_bodies(body), relative_path, stripped, header_end
            )

        for match in _PACKAGE_HEADER_RE.finditer(stripped):
            name = match.group(1)
            end_match = _ENDPACKAGE_RE.search(stripped, match.end())
            body_end = end_match.start() if end_match else len(stripped)
            body = stripped[match.end():body_end]
            packages[name] = PackageSymbol(
                name=name,
                location=_location(relative_path, stripped, match.start()),
                parameters=_parse_params(body, relative_path, stripped, match.end(), require_keyword=True),
                functions=_parse_functions(body, relative_path, stripped, match.end()),
            )

    def _header_end(self, text: str, search_from: int) -> int:
        semicolon = text.find(";", search_from)
        return semicolon + 1 if semicolon != -1 else search_from

    def _extract_header(self, text: str, search_from: int) -> tuple[str, str]:
        """Returns (params_text, ports_text) for a module header, handling
        nested parentheses (e.g. `parameter int W = $clog2(8)`) correctly by
        scanning for balanced parens rather than a single non-greedy regex."""

        pos = search_from
        params_text = ""
        # optional "#( ... )" parameter port list
        skip = text[pos:].lstrip()
        lead_ws = len(text[pos:]) - len(skip)
        if skip.startswith("#"):
            hash_pos = pos + lead_ws
            open_paren = text.find("(", hash_pos)
            if open_paren != -1:
                params_text, pos = _extract_balanced(text, open_paren)

        open_paren = text.find("(", pos)
        semicolon = text.find(";", pos)
        ports_text = ""
        if open_paren != -1 and (semicolon == -1 or open_paren < semicolon):
            ports_text, _ = _extract_balanced(text, open_paren)
        return params_text, ports_text

    def _build_instance_tree(
        self, modules: dict[str, ModuleSymbol], instances_by_module: dict[str, list[InstanceNode]]
    ) -> list[InstanceNode]:
        """Roots are modules never instantiated by any other module in this
        workspace (typical for a design's top level(s)); everything else
        hangs off its parent's `children`."""

        instantiated_modules = {
            node.module_name for children in instances_by_module.values() for node in children
        }

        def attach_children(node: InstanceNode, depth: int) -> InstanceNode:
            if depth > 32:  # guard against a recursive/cyclic instantiation mistake in the source
                return node
            for child in instances_by_module.get(node.module_name, []):
                attach_children(child, depth + 1)
                node.children.append(child)
            return node

        roots: list[InstanceNode] = []
        for module_name in modules:
            if module_name in instantiated_modules:
                continue
            root = InstanceNode(instance_name=module_name, module_name=module_name)
            attach_children(root, 0)
            roots.append(root)
        return roots


def _strip_comments(text: str) -> str:
    out: list[str] = []
    in_block = False
    for line in text.splitlines(keepends=True):
        i = 0
        n = len(line)
        while i < n:
            if in_block:
                end = line.find("*/", i)
                if end == -1:
                    i = n
                else:
                    in_block = False
                    i = end + 2
                continue
            if line[i:i + 2] == "/*":
                end = line.find("*/", i + 2)
                if end == -1:
                    in_block = True
                    i = n
                else:
                    i = end + 2
                continue
            if line[i:i + 2] == "//":
                break
            out.append(line[i])
            i += 1
        if line.endswith("\n") and (not out or out[-1] != "\n"):
            out.append("\n")
    return "".join(out)


def _strip_function_bodies(body: str) -> str:
    """Removes function/task bodies (replaced with spaces, preserving line
    numbers) so instance detection doesn't mistake a function's argument
    list for a module instantiation."""

    result = list(body)
    for match in _FUNC_TASK_RE.finditer(body):
        kind = match.group(1)
        end_match = _ENDFUNC_TASK_RE[kind].search(body, match.end())
        end = end_match.end() if end_match else len(body)
        for i in range(match.start(), end):
            if result[i] != "\n":
                result[i] = " "
    return "".join(result)


def _extract_balanced(text: str, open_index: int) -> tuple[str, int]:
    depth = 0
    i = open_index
    while i < len(text):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[open_index + 1:i], i + 1
        i += 1
    return text[open_index + 1:], len(text)


def _split_top_level(text: str) -> list[str]:
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in text:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    if current:
        parts.append("".join(current))
    return [p.strip() for p in parts if p.strip()]


def _location(relative_path: str, full_text: str, offset: int) -> SourceLocation:
    line = full_text.count("\n", 0, offset) + 1
    return SourceLocation(file=relative_path, line=line)


def _name_before_paren(text: str, paren_index: int) -> str:
    i = paren_index - 1
    while i >= 0 and text[i].isspace():
        i -= 1
    end = i + 1
    while i >= 0 and (text[i].isalnum() or text[i] == "_"):
        i -= 1
    return text[i + 1:end]


def _parse_ports(ports_text: str) -> list[Port]:
    ports: list[Port] = []
    last_direction = "input"
    for entry in _split_top_level(ports_text):
        direction_match = re.search(r"\b(input|output|inout)\b", entry)
        if direction_match:
            last_direction = direction_match.group(1)
        dims_match = re.search(r"(\[[^\]]*\](?:\s*\[[^\]]*\])*)", entry)
        name_match = re.search(r"(\w+)\s*$", re.sub(r"\[[^\]]*\]", "", entry).strip())
        if not name_match:
            continue
        name = name_match.group(1)
        if name in _KEYWORDS:
            continue
        ports.append(Port(name=name, direction=last_direction, packed_dimensions=dims_match.group(1) if dims_match else None))
    return ports


def _parse_params(
    text: str, relative_path: str, full_text: str, base_offset: int, require_keyword: bool = False
) -> list[Parameter]:
    params: list[Parameter] = []
    if require_keyword:
        for match in _PARAM_DECL_RE.finditer(text):
            rest = text[match.end():]
            stop = re.search(r"[;,]", rest)
            entry = rest[:stop.start()] if stop else rest
            name_value = re.match(r"\s*(?:\w+\s+)*?(\w+)\s*(?:=\s*(.+))?$", entry.strip())
            if name_value:
                params.append(
                    Parameter(
                        name=name_value.group(1),
                        default_value=name_value.group(2).strip() if name_value.group(2) else None,
                        location=_location(relative_path, full_text, base_offset + match.start()),
                    )
                )
        return params

    for entry in _split_top_level(text):
        entry = _PARAM_DECL_RE.sub("", entry).strip()
        if not entry:
            continue
        name_value = re.match(r"(?:\w+\s+)*?(\w+)\s*(?:=\s*(.+))?$", entry)
        if not name_value:
            continue
        name = name_value.group(1)
        if name in _KEYWORDS:
            continue
        params.append(
            Parameter(
                name=name,
                default_value=name_value.group(2).strip() if name_value.group(2) else None,
                location=_location(relative_path, full_text, base_offset),
            )
        )
    return params


def _parse_signals(body: str, relative_path: str, full_text: str, base_offset: int) -> list[Signal]:
    signals: list[Signal] = []
    for match in _SIGNAL_DECL_RE.finditer(body):
        kind = match.group(1)
        rest = re.sub(r"\[[^\]]*\]", "", match.group(2))
        for entry in _split_top_level(rest):
            name_match = re.match(r"(\w+)", entry.strip())
            if not name_match or name_match.group(1) in _KEYWORDS:
                continue
            signals.append(
                Signal(
                    name=name_match.group(1),
                    kind=kind,
                    location=_location(relative_path, full_text, base_offset + match.start()),
                )
            )
    return signals


def _parse_functions(body: str, relative_path: str, full_text: str, base_offset: int) -> list[FunctionSymbol]:
    functions: list[FunctionSymbol] = []
    for match in _FUNC_TASK_RE.finditer(body):
        kind = match.group(1)
        open_paren = body.find("(", match.end())
        semicolon = body.find(";", match.end())
        if open_paren == -1 or (semicolon != -1 and open_paren > semicolon):
            continue  # no arg list on this line (e.g. `function foo;` old-style) -- skip for MVP
        name = _name_before_paren(body, open_paren)
        if not name or name in _KEYWORDS:
            continue
        functions.append(
            FunctionSymbol(
                name=name,
                kind=kind,
                location=_location(relative_path, full_text, base_offset + match.start()),
            )
        )
    return functions


def _parse_instances(body: str, relative_path: str, full_text: str, base_offset: int) -> list[InstanceNode]:
    instances: list[InstanceNode] = []
    for match in _INSTANCE_RE.finditer(body):
        type_name = match.group("type")
        inst_name = match.group("inst")
        if type_name in _KEYWORDS or inst_name in _KEYWORDS:
            continue
        instances.append(
            InstanceNode(
                instance_name=inst_name,
                module_name=type_name,
                location=_location(relative_path, full_text, base_offset + match.start()),
            )
        )
    return instances
