import Link from "next/link";

export default function ProjectsPage() {
    return (
        <div className="page-container">
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 8 }}>
                Projects
            </h1>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 24 }}>
                Manage your research projects
            </p>
            <Link href="/dashboard" className="btn-primary">
                Go to Dashboard →
            </Link>
        </div>
    );
}
