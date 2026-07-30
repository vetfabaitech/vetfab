"""Converts `app/models/symbol.py` dataclasses to their `app/schemas/index.py`
Pydantic counterparts. Kept separate from both so neither the cache's plain
dataclasses nor the API's response schemas need to know about each other.
"""

from app.models.symbol import FunctionSymbol, InstanceNode, ModuleSymbol, PackageSymbol, Parameter, Port, Signal, SourceLocation
from app.schemas.index import (
    FunctionSymbolSchema,
    InstanceNodeSchema,
    ModuleSymbolSchema,
    PackageSymbolSchema,
    ParameterSchema,
    PortSchema,
    SignalSchema,
    SourceLocationSchema,
)


def _location(location: SourceLocation | None) -> SourceLocationSchema | None:
    if location is None:
        return None
    return SourceLocationSchema(file=location.file, line=location.line, column=location.column)


def _parameter(parameter: Parameter) -> ParameterSchema:
    return ParameterSchema(
        name=parameter.name, defaultValue=parameter.default_value, location=_location(parameter.location)
    )


def _port(port: Port) -> PortSchema:
    return PortSchema(name=port.name, direction=port.direction, packedDimensions=port.packed_dimensions)


def _signal(signal: Signal) -> SignalSchema:
    return SignalSchema(name=signal.name, kind=signal.kind, location=_location(signal.location))


def _function(function: FunctionSymbol) -> FunctionSymbolSchema:
    return FunctionSymbolSchema(name=function.name, kind=function.kind, location=_location(function.location))


def module_to_schema(module: ModuleSymbol) -> ModuleSymbolSchema:
    return ModuleSymbolSchema(
        name=module.name,
        location=_location(module.location),
        ports=[_port(p) for p in module.ports],
        parameters=[_parameter(p) for p in module.parameters],
        signals=[_signal(s) for s in module.signals],
        functions=[_function(f) for f in module.functions],
    )


def package_to_schema(package: PackageSymbol) -> PackageSymbolSchema:
    return PackageSymbolSchema(
        name=package.name,
        location=_location(package.location),
        parameters=[_parameter(p) for p in package.parameters],
        functions=[_function(f) for f in package.functions],
    )


def instance_to_schema(node: InstanceNode) -> InstanceNodeSchema:
    return InstanceNodeSchema(
        instanceName=node.instance_name,
        moduleName=node.module_name,
        location=_location(node.location),
        children=[instance_to_schema(child) for child in node.children],
    )
