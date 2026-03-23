import { Trash2 } from "lucide-react";
import { Client } from "@dim/shared";
import { Collapsible, Badge } from "@stefgo/react-ui-components";

const ClientInfo = ({ client }: { client: Client }) => (
  <div className="px-12 py-3 bg-app-bg dark:bg-card-dark text-xs space-y-2 border-t dark:border-border-dark">
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <span className="text-text-muted dark:text-text-muted-dark">ID:</span>
      <span className="text-text-primary dark:text-text-primary-dark break-all">
        {client.id}
      </span>
    </div>
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <span className="text-text-muted dark:text-text-muted-dark">Hostname:</span>
      <span className="text-text-primary dark:text-text-primary-dark">
        {client.hostname}
      </span>
    </div>
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <span className="text-text-muted dark:text-text-muted-dark">Status:</span>
      <Badge
        variant={client.status === "online" ? "success" : "gray"}
        size="sm"
      >
        {client.status}
      </Badge>
    </div>
    {client.displayName && (
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <span className="text-text-muted dark:text-text-muted-dark">
          Display Name:
        </span>
        <span className="text-text-primary dark:text-text-primary-dark">
          {client.displayName}
        </span>
      </div>
    )}
  </div>
);

interface ClientSelectProps {
  clients: Client[];
  selectedClientId: string;
  onSelect: (clientId: string) => void;
  isSelecting?: boolean;
  onSetIsSelecting?: (val: boolean) => void;
  label?: string;
}

export const ClientSelect = ({
  clients,
  selectedClientId,
  onSelect,
  isSelecting: externalIsSelecting,
  onSetIsSelecting,
  label = "Target Client",
}: ClientSelectProps) => {
  const selectedClient = clients.find((c) => c.id === selectedClientId);

  if (externalIsSelecting) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase">
            Select Client
          </label>
          <button
            onClick={() => onSetIsSelecting?.(false)}
            className="text-xs text-primary font-bold hover:underline"
          >
            Back
          </button>
        </div>

        <div className="divide-y dark:divide-border-dark border dark:border-border-dark rounded-lg overflow-hidden dark:bg-card-dark">
          {clients.map((client) => (
            <Collapsible
              key={client.id}
              title={
                <div
                  className="flex items-center gap-2 overflow-hidden"
                  onClick={() => {
                    onSelect(client.id);
                    onSetIsSelecting?.(false);
                  }}
                >
                  <div
                    className={`w-3 h-3 rounded-full ${selectedClientId === client.id ? "bg-primary" : "border-2 dark:border-border-dark"}`}
                  />
                  <div className="font-medium text-sm text-text-primary dark:text-text-primary-dark truncate">
                    {client.displayName || client.hostname}
                  </div>
                  <Badge
                    variant={client.status === "online" ? "success" : "gray"}
                    size="sm"
                  >
                    {client.status}
                  </Badge>
                </div>
              }
            >
              <ClientInfo client={client} />
            </Collapsible>
          ))}
          {clients.length === 0 && (
            <div className="p-8 text-center text-sm text-text-muted dark:text-text-muted-dark">
              No clients available.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase">
          {label}
        </label>
        <button
          onClick={() => onSetIsSelecting?.(true)}
          className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
        >
          {selectedClient ? "Change Client" : "Set Client"}
        </button>
      </div>

      <div className="flex-1 border dark:border-border-dark rounded-lg bg-app-bg dark:bg-app-bg-dark overflow-y-auto p-2 space-y-2">
        {selectedClient ? (
          <div className="dark:bg-card-dark border dark:border-border-dark rounded overflow-hidden group">
            <Collapsible
              title={
                <div className="flex justify-between items-center gap-2 w-full">
                  <div className="text-sm text-text-primary dark:text-text-primary-dark truncate font-medium opacity-90">
                    {selectedClient.displayName || selectedClient.hostname}
                    <Badge
                      variant={
                        selectedClient.status === "online" ? "success" : "gray"
                      }
                      size="sm"
                      className="ml-2"
                    >
                      {selectedClient.status}
                    </Badge>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect("");
                    }}
                    className="p-1 text-text-muted dark:text-text-muted-dark hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                    title="Clear Selection"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              }
            >
              <ClientInfo client={selectedClient} />
            </Collapsible>
          </div>
        ) : (
          <div className="px-1 py-2 text-md text-text-muted dark:text-text-muted-dark">
            No client selected
          </div>
        )}
      </div>
    </div>
  );
};
