export const formatDate = (
    date: Date | string | number | null | undefined,
): string => {
    if (!date) return "Never";

    let d = new Date(date);

    if (typeof date === "string") {
        // Handle SQLite default format "YYYY-MM-DD HH:MM:SS" -> Treat as UTC
        if (date.includes(" ") && !date.includes("T")) {
            d = new Date(date.replace(" ", "T") + "Z");
        }
    }

    if (isNaN(d.getTime())) {
        return "Invalid Date";
    }

    return new Intl.DateTimeFormat("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(d);
};

export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};
