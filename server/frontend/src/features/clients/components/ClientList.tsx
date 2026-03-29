import { Monitor } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";
import { Client } from "@dim/shared";
import { usePagination } from "../../../hooks/usePagination";
import { formatDate } from "../../../utils";
import { DataTableDef } from "@stefgo/react-ui-components";
import { DataListDef, DataListColumnDef } from "@stefgo/react-ui-components";
import { DataMultiView } from "@stefgo/react-ui-components";

interface ClientListProps {
  clients: Client[];
  setSelectedClient?: (client: Client | null) => void;
  renderRowActions?: (client: Client) => ReactNode;
  extraActions?: ReactNode;
}

export const ClientList = ({
  clients,
  setSelectedClient,
  renderRowActions,
  extraActions,
}: ClientListProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (a.displayName || a.hostname).localeCompare(b.displayName || b.hostname)),
    [clients],
  );

  const filteredClients = useMemo(() => {
    if (!searchQuery) return sortedClients;
    const q = searchQuery.toLowerCase();
    return sortedClients.filter(c =>
      (c.displayName ?? '').toLowerCase().includes(q) ||
      c.hostname.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q),
    );
  }, [sortedClients, searchQuery]);

  const {
    currentItems: currentClients,
    currentPage,
    totalPages,
    itemsPerPage,
    totalItems,
    goToPage,
    setItemsPerPage,
  } = usePagination(filteredClients, 10);

  const buildTableDefinitions = (): DataTableDef<Client>[] => {
    const cols: DataTableDef<Client>[] = [];

    cols.push({
      tableHeader: "Client",
      sortable: true,
      sortValue: (client) => client.displayName || client.hostname,
      tableItemRender: (client) => (
        <>
          <div className="flex items-center gap-3 mb-1">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${client.status === "online" ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-border dark:bg-border-dark"}`}
            />
            <div
              className={`text-sm text-text-primary dark:text-text-primary-dark ${client.status === "online" ? "" : "opacity-70"} truncate`}
            >
              {client.displayName || client.hostname}
              {client.displayName && (
                <span className="text-xs font-normal text-text-muted dark:text-text-muted-dark ml-2">
                  ({client.hostname})
                </span>
              )}
            </div>
          </div>
          <div className="text-xs font-mono text-text-muted dark:text-text-muted-dark pl-5 truncate opacity-70">
            {client.id}
          </div>
        </>
      ),
    });

    cols.push({
      tableHeader: null,
      tableCellClassName: "align-top text-sm text-text-primary",
      tableItemRender: (client) =>
        client.status !== "online" ? (
          <div className="whitespace-nowrap opacity-70">
            Last seen: {formatDate(client.lastSeen)}
          </div>
        ) : null,
    });

    if (renderRowActions) {
      cols.push({
        tableHeader: "Action",
        tableHeaderClassName: "text-center",
        tableCellClassName: "content-center",
        tableItemRender: (client) => (
          <div onClick={(e) => e.stopPropagation()}>
            {renderRowActions(client)}
          </div>
        ),
      });
    }

    return cols;
  };

  const buildListDefinitions = (): DataListColumnDef<Client>[] => {
    const contentFields: DataListDef<Client>[] = [];
    const actionFields: DataListDef<Client>[] = [];

    contentFields.push({
      listItemRender: (client) => (
        <div className="flex items-center gap-2 py-1">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${client.status === "online" ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-border dark:bg-border-dark"}`}
          />
          <div
            className={`font-inherit text-text-primary dark:text-text-primary-dark ${client.status === "online" ? "" : "opacity-70"} truncate`}
          >
            {client.displayName || client.hostname}
            {client.displayName && (
              <span className="text-xs font-normal text-text-muted dark:text-text-muted-dark ml-2">
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
        <span className="text-sm text-text-primary dark:text-text-primary-dark">
          {client.version}
        </span>
      ),
      listLabel: "Version",
    });

    contentFields.push({
      listItemRender: (client) =>
        client.status !== "online" ? (
          <span className="text-sm text-text-muted dark:text-text-muted-dark">
            {formatDate(client.lastSeen)}
          </span>
        ) : (
          <span className="text-green-600 dark:text-green-500 text-sm">
            Online
          </span>
        ),
      listLabel: "Status",
    });

    if (renderRowActions) {
      actionFields.push({
        listItemRender: (client) => (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2 md:mt-0 flex justify-center"
          >
            {renderRowActions(client)}
          </div>
        ),
        listLabel: null,
      });
    }

    return actionFields.length > 0
      ? [
          { fields: contentFields, columnClassName: "flex-1" },
          { fields: actionFields, columnClassName: "md:text-right" },
        ]
      : [{ fields: contentFields, columnClassName: "flex-1" }];
  };

  const tableColumns = buildTableDefinitions();
  const listColumns = buildListDefinitions();

  return (
    <DataMultiView
      title={
        <>
          <Monitor size={18} className="text-text-muted dark:text-text-muted-dark" /> Clients
        </>
      }
      extraActions={extraActions}
      defaultSort={{ colIndex: 0, direction: 'asc' }}
      viewModeStorageKey="clientViewMode"
      data={currentClients}
      tableDef={tableColumns}
      listColumns={listColumns}
      keyField="id"
      searchable
      searchPlaceholder="Search Clients ..."
      onSearchChange={setSearchQuery}
      emptyMessage="No clients connected."
      rowClassName="align-top"
      onRowClick={setSelectedClient ?? undefined}
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
