import { useMemo, useState } from "react";
import { DockerContainer, DockerActionType } from "@dim/shared";
import { Play, Square, RotateCcw, Trash2, Pause, PlayCircle, Box } from "lucide-react";
import {
  DataMultiView,
  DataTableDef,
  DataListDef,
  DataListColumnDef,
  DataAction,
} from "@stefgo/react-ui-components";
import { usePagination } from "@stefgo/react-ui-components";

interface ContainerListProps {
  containers: DockerContainer[];
  onAction: (action: DockerActionType, target: string) => void;
}

const STATE_COLORS: Record<string, string> = {
  running: "bg-green-500",
  exited: "bg-border dark:bg-border-dark",
  paused: "bg-yellow-400",
  restarting: "bg-blue-400 animate-pulse",
  dead: "bg-red-500",
  created: "bg-purple-400",
};

export const ContainerList = ({ containers, onAction}: ContainerListProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const sortedContainers = useMemo(
    () => [...containers].sort((a, b) => (a.names[0]?.replace(/^\//, "") ?? a.id).localeCompare(b.names[0]?.replace(/^\//, "") ?? b.id)),
    [containers],
  );

  const filteredContainers = useMemo(() => {
    if (!searchQuery) return sortedContainers;
    const q = searchQuery.toLowerCase();
    return sortedContainers.filter(c =>
      c.names.some(n => n.replace(/^\//, '').toLowerCase().includes(q)) ||
      c.image.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q),
    );
  }, [sortedContainers, searchQuery]);

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(filteredContainers, 10);

  const buildMenuEntries = (c: DockerContainer) => {
    const entries = [];
    const isRunning = c.state === "running";
    const isPaused = c.state === "paused";

    if (!isRunning && !isPaused) {
      entries.push({ label: "Start", icon: Play, onClick: () => onAction("container:start", c.id), variant: "default" as const });
    }
    if (isRunning) {
      entries.push({ label: "Stop", icon: Square, onClick: () => onAction("container:stop", c.id), variant: "default" as const });
      entries.push({ label: "Pause", icon: Pause, onClick: () => onAction("container:pause", c.id), variant: "default" as const });
      entries.push({ label: "Restart", icon: RotateCcw, onClick: () => onAction("container:restart", c.id), variant: "default" as const });
    }
    if (isPaused) {
      entries.push({ label: "Resume", icon: PlayCircle, onClick: () => onAction("container:unpause", c.id), variant: "default" as const });
    }
    entries.push({ label: "Remove", icon: Trash2, onClick: () => onAction("container:remove", c.id), variant: "danger" as const });
    return entries;
  };

  const tableDef: DataTableDef<DockerContainer>[] = [
    {
      tableHeader: "Name",
      sortable: true,
      sortValue: (c) => c.names[0]?.replace(/^\//, '') ?? c.id,
      tableItemRender: (c) => {
        const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
        const color = STATE_COLORS[c.state] ?? "bg-border dark:bg-border-dark";
        return (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
            <span className="text-sm">{name}</span>
          </div>
        );
      },
    },
    {
      tableHeader: "Configured Image",
      sortable: true,
      sortValue: (c) => c.configImage ?? "",
      tableCellClassName: "text-sm max-w-[200px] truncate",
      tableItemRender: (c) => <span>{c.configImage}</span>,
    },
    {
      tableHeader: "Status",
      sortable: true,
      accessorKey: "status",
      tableCellClassName: "text-text-muted dark:text-text-muted-dark text-sm",
    },
    {
      tableHeader: "Ports",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (c) => {
        const ports = Array.from(
          new Map(
            c.ports.filter((p) => p.publicPort).map((p) => [`${p.publicPort}→${p.privatePort}/${p.type}`, p]),
          ).values(),
        ).map((p) => `${p.publicPort}→${p.privatePort}/${p.type}`);
        if (ports.length === 0) return <>–</>;
        return (
          <div className="flex flex-wrap gap-y-0.5">
            {ports.map((p, i) => (
              <span key={p}>{p}{i < ports.length - 1 ? ", " : ""}</span>
            ))}
          </div>
        );
      },
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DataAction
            rowId={c.id}
            menuEntries={buildMenuEntries(c)}
          />
        </div>
      ),
    },
  ];

  const listColumns: DataListColumnDef<DockerContainer>[] = [
    {
      fields: [
        {
          listLabel: null,
          listItemRender: (c) => {
            const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
            const color = STATE_COLORS[c.state] ?? "bg-border dark:bg-border-dark";
            return (
              <div className="flex items-center gap-2 py-1">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                <span className="font-medium text-text-primary dark:text-text-primary-dark">{name}</span>
              </div>
            );
          },
        },
        {
          listLabel: "Configured Image",
          listItemRender: (c) => <span className="text-sm">{c.configImage}</span>,
        },
        {
          listLabel: "Current Image",
          listItemRender: (c) => <span className="text-sm">{c.image}</span>,
        },
        {
          listLabel: "Status",
          listItemRender: (c) => <span className="text-sm">{c.status}</span>,
        },
        {
          listLabel: "Ports",
          listItemRender: (c) => (
            <span className="text-sm">
              {c.ports.filter((p) => p.publicPort).map((p) => `${p.publicPort}→${p.privatePort}/${p.type}`).join(", ") || "–"}
            </span>
          ),
        }],
    },
    {
      fields: [
        {
          listLabel: null,
          listItemRender: (c) => (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
              <DataAction
                rowId={c.id}
                menuEntries={buildMenuEntries(c)}
              />
            </div>
          ),
        },
      ] satisfies DataListDef<DockerContainer>[],
      columnClassName: "md:text-right",
    },
  ];

  return (
    <DataMultiView
      title={<><Box size={18} className="text-text-muted dark:text-text-muted-dark" /> Container</>}
      defaultSort={{ colIndex: 0, direction: 'asc' }}
      viewModeStorageKey="dockerContainerViewMode"
      data={currentItems}
      tableDef={tableDef}
      listColumns={listColumns}
      keyField="id"
      searchable
      searchPlaceholder="Search Container ..."
      onSearchChange={setSearchQuery}
      emptyMessage="No containers found."
      pagination={{ currentPage, totalPages, itemsPerPage, totalItems, onPageChange: goToPage, onItemsPerPageChange: setItemsPerPage }}
    />
  );
};
