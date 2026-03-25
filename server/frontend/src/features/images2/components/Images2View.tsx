import { Layers } from "lucide-react";
import {
  DataMultiView,
  DataTableDef,
  DataListColumnDef,
  DataListDef,
} from "@stefgo/react-ui-components";
import { useImages2Data } from "../useImages2Data";
import { usePagination } from "../../../hooks/usePagination";
import { ImageGroup } from "../images2Types";

export const Images2View = () => {
  const groups = useImages2Data();

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(groups, 20);

  const tableDef: DataTableDef<ImageGroup>[] = [
    {
      tableHeader: "Repository",
      accessorKey: "repository",
      sortable: true,
      tableItemRender: (g) => <span className="text-sm font-medium">{g.repository}</span>,
    },
    {
      tableHeader: "Tag",
      accessorKey: "tag",
      sortable: true,
      tableCellClassName: "text-sm",
      tableItemRender: (g) => <span>{g.tag || "–"}</span>,
    },
    {
      tableHeader: "Images",
      accessorKey: "imageCount",
      sortable: true,
      tableCellClassName: "text-sm text-center",
      tableHeaderClassName: "text-center",
      tableItemRender: (g) => <span>{g.imageCount}</span>,
    },
    {
      tableHeader: "Clients",
      accessorKey: "clientCount",
      sortable: true,
      tableCellClassName: "text-sm text-center",
      tableHeaderClassName: "text-center",
      tableItemRender: (g) => <span>{g.clientCount}</span>,
    },
    {
      tableHeader: "Container",
      accessorKey: "containerCount",
      sortable: true,
      tableCellClassName: "text-sm text-center",
      tableHeaderClassName: "text-center",
      tableItemRender: (g) => <span>{g.containerCount}</span>,
    },
  ];

  const listContentFields: DataListDef<ImageGroup>[] = [
    {
      listLabel: null,
      listItemRender: (g) => (
        <span className="text-sm font-medium">
          {g.repository}:{g.tag || "–"}
        </span>
      ),
    },
    {
      listLabel: "Images",
      listItemRender: (g) => <span className="text-sm">{g.imageCount}</span>,
    },
    {
      listLabel: "Clients",
      listItemRender: (g) => <span className="text-sm">{g.clientCount}</span>,
    },
    {
      listLabel: "Container",
      listItemRender: (g) => <span className="text-sm">{g.containerCount}</span>,
    },
  ];

  const listColumns: DataListColumnDef<ImageGroup>[] = [
    { fields: listContentFields, columnClassName: "flex-1" },
  ];

  return (
    <DataMultiView
      title={
        <>
          <Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images2
        </>
      }
      data={currentItems}
      keyField="id"
      tableDef={tableDef}
      listColumns={listColumns}
      emptyMessage="No Images found."
      viewModeStorageKey="images2ViewMode"
      pagination={{
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        onPageChange: goToPage,
        onItemsPerPageChange: setItemsPerPage,
      }}
    />
  );
};
