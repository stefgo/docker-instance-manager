import { Plus, Monitor, Trash2, Edit } from "lucide-react";
import { Client } from "@dim/shared";
import { usePagination } from "../../../hooks/usePagination";
import { formatDate } from "../../../utils";
import { DataTableDef } from "@stefgo/react-ui-components";
import { DataAction } from "@stefgo/react-ui-components";
import { DataListDef, DataListColumnDef } from "@stefgo/react-ui-components";
import { DataMultiView } from "@stefgo/react-ui-components";

interface ClientListProps {
  clients: Client[];
  setSelectedClient: (client: Client | null) => void;
  deleteClient: (client: Client) => void;
  generateToken: () => void;
  editClient: (client: Client) => void;
}

export const ClientList = ({
  clients,
  setSelectedClient,
  deleteClient,
  generateToken,
  editClient,
}: ClientListProps) => {
  const {
    currentItems: currentClients,
    currentPage,
    totalPages,
    itemsPerPage,
    totalItems,
    goToPage,
    setItemsPerPage,
  } = usePagination(clients, 10);

  const buildTableDefinitions = (): DataTableDef<Client>[] => {
    const cols: DataTableDef<Client>[] = [];

    cols.push({
      tableHeader: "Client",
      tableItemRender: (client) => (
        <>
          <div className="flex items-center gap-3 mb-1">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${client.status === "online" ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-gray-400 dark:bg-app-input"}`}
            />
            <div
              className={`text-sm text-gray-900 dark:text-app-text-main ${client.status === "online" ? "" : "opacity-70"} truncate`}
            >
              {client.displayName || client.hostname}
              {client.displayName && (
                <span className="text-xs font-normal text-gray-500 dark:text-app-text-muted ml-2">
                  ({client.hostname})
                </span>
              )}
            </div>
          </div>
          <div className="text-xs font-mono text-gray-500 dark:text-app-text-muted pl-5 truncate opacity-70">
            {client.id}
          </div>
        </>
      ),
    });

    cols.push({
      tableHeader: null,
      tableCellClassName:
        "align-top text-sm text-gray-900 dark:text-app-text-main",
      tableItemRender: (client) =>
        client.status !== "online" ? (
          <div className="whitespace-nowrap opacity-70">
            Last seen: {formatDate(client.lastSeen)}
          </div>
        ) : null,
    });

    cols.push({
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (client) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DataAction
            rowId={client.id}
            menuEntries={[
              {
                label: "Edit Client",
                icon: Edit,
                onClick: () => {
                  editClient(client);
                },
                variant: "default",
              },
              {
                label: "Delete Client",
                icon: Trash2,
                onClick: () => {
                  deleteClient(client);
                },
                variant: "danger",
              },
            ]}
          />
        </div>
      ),
    });

    return cols;
  };

  const buildListDefinitions = (): DataListColumnDef<Client>[] => {
    const contentFields: DataListDef<Client>[] = [];
    const actionFields: DataListDef<Client>[] = [];

    contentFields.push({
      listItemRender: (client) => (
        <div className="flex items-center gap-2 py-1">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${client.status === "online" ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-gray-400 dark:bg-app-input"}`}
          />
          <div
            className={`font-inherit text-gray-900 dark:text-app-text-main ${client.status === "online" ? "" : "opacity-70"} truncate`}
          >
            {client.displayName || client.hostname}
            {client.displayName && (
              <span className="text-xs font-normal text-gray-500 dark:text-app-text-muted ml-2">
                ({client.hostname})
              </span>
            )}
          </div>
        </div>
      ),
      listLabel: null,
    });

    contentFields.push({
      accessorKey: "id",
      listLabel: "ID",
    });

    contentFields.push({
      listItemRender: (client) => (
        <span className="text-sm text-gray-700 dark:text-app-text-main">
          {client.version}
        </span>
      ),
      listLabel: "Version",
    });

    contentFields.push({
      listItemRender: (client) =>
        client.status !== "online" ? (
          <span className="text-sm text-gray-500 dark:text-app-text-muted">
            {formatDate(client.lastSeen)}
          </span>
        ) : (
          <span className="text-green-600 dark:text-green-500 text-sm">
            Online
          </span>
        ),
      listLabel: "Status",
    });

    actionFields.push({
      listItemRender: (client) => (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 md:mt-0 flex justify-center"
        >
          <DataAction
            rowId={client.id}
            menuEntries={[
              {
                label: "Edit Client",
                icon: Edit,
                onClick: () => {
                  editClient(client);
                },
                variant: "default",
              },
              {
                label: "Delete Client",
                icon: Trash2,
                onClick: () => {
                  deleteClient(client);
                },
                variant: "danger",
              },
            ]}
          />
        </div>
      ),
      listLabel: null,
    });

    return [
      { fields: contentFields, columnClassName: "flex-1" },
      { fields: actionFields, columnClassName: "md:text-right" },
    ];
  };

  const tableColumns = buildTableDefinitions();
  const listColumns = buildListDefinitions();

  return (
    <DataMultiView
      title={
        <>
          <Monitor size={18} className="text-app-text-muted" /> Clients
        </>
      }
      extraActions={
        <button
          onClick={generateToken}
          className="px-3 py-1 bg-app-accent text-white text-xs rounded hover:bg-app-accent-hover"
        >
          <Plus size={12} className="inline mr-1" />
          Generate New Token
        </button>
      }
      viewModeStorageKey="clientViewMode"
      data={currentClients}
      tableDef={tableColumns}
      listColumns={listColumns}
      keyField="id"
      emptyMessage="No clients connected"
      rowClassName="align-top"
      onRowClick={setSelectedClient}
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
