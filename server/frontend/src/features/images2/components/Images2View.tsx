import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { useImages2Data } from "../useImages2Data";
import { ImageTreeNode } from "../images2Types";

export const Images2View = () => {
  const groups = useImages2Data();

  const tableDef: DataTableDef<ImageTreeNode>[] = [
    {
      tableHeader: "Repository:Tag / Image",
      tableItemRender: (node) =>
        node.nodeType === "repository" ? (
          <span className="text-sm font-medium">
            {node.repository}:{node.tag || "–"}
          </span>
        ) : (
          <code className="text-xs font-mono text-text-muted dark:text-text-muted-dark">
            {node.digest}
          </code>
        ),
    },
    {
      tableHeader: "Images",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-sm text-center",
      tableItemRender: (node) => (
        <span>{node.nodeType === "repository" ? node.imageCount : "–"}</span>
      ),
    },
    {
      tableHeader: "Clients",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-sm text-center",
      tableItemRender: (node) => <span>{node.clientCount}</span>,
    },
    {
      tableHeader: "Container",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-sm text-center",
      tableItemRender: (node) => <span>{node.containerCount}</span>,
    },
  ];

  return (
    <DataMultiView<ImageTreeNode>
      title={
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers size={16} className="text-text-muted dark:text-text-muted-dark" />
          Images
        </div>
      }
      viewModeStorageKey="images2ViewMode"
      data={groups}
      keyField="id"
      tableDef={tableDef}
      getChildren={(node) => node.children ?? null}
      emptyMessage="No images found."
      className="h-full"
    />
  );
};
