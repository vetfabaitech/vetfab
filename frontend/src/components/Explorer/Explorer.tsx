"use client";

import WorkspaceHeader from "./WorkspaceHeader";
import ExplorerHeader from "./ExplorerHeader";
import ExplorerSearch from "./ExplorerSearch";
import Breadcrumb from "./Breadcrumb";
import FileTree from "./FileTree";

export default function Explorer() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceHeader />
      <ExplorerHeader />
      <ExplorerSearch />
      <FileTree />
      <Breadcrumb />
    </div>
  );
}
