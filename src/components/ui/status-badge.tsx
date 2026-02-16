interface StatusBadgeProps {
    status: "completed" | "processing" | "running" | "queued" | "failed" | "draft";
    label?: string;
}

const statusConfig: Record<string, { label: string; dot: string }> = {
    completed: { label: "Completed", dot: "#10b981" },
    processing: { label: "Processing", dot: "#3b82f6" },
    running: { label: "Running", dot: "#3b82f6" },
    queued: { label: "Queued", dot: "#64748b" },
    failed: { label: "Failed", dot: "#ef4444" },
    draft: { label: "Draft", dot: "#8b5cf6" },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
    const config = statusConfig[status] || statusConfig.draft;
    const badgeClass = status === "running" ? "processing" : status;

    return (
        <span className={`badge badge-${badgeClass}`}>
            <span
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: config.dot,
                    display: "inline-block",
                }}
            />
            {label || config.label}
        </span>
    );
}
