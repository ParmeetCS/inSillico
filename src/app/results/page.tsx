import Link from "next/link";

export default function ResultsIndexPage() {
    return (
        <div className="page-container">
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 8 }}>
                Results
            </h1>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 24 }}>
                View your completed simulation results
            </p>
            <Link href="/results/SIM-4821" className="btn-primary">
                View Demo Result →
            </Link>
        </div>
    );
}
