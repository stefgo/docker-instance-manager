import { Layers } from "lucide-react";
import { DataTableDef, DataTreeTable } from "@stefgo/react-ui-components";
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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-card dark:border-card-dark bg-card dark:bg-card-dark shrink-0 text-sm font-medium text-text-primary dark:text-text-primary-dark">
        <Layers size={16} className="text-text-muted dark:text-text-muted-dark" />
        Images
      </div>
      <div className="flex-1 min-h-0">
        <DataTreeTable<ImageTreeNode>
          data={groups}
          keyField="id"
          getChildren={(node) => node.children ?? null}
          itemDef={tableDef}
          emptyMessage="No images found."
        />
      </div>
    </div>
  );
};
