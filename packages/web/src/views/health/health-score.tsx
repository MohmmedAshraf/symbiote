interface HealthScoreProps {
    score: number;
}

export function HealthScore({ score }: HealthScoreProps) {
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (score / 100) * circumference;
    const color =
        score >= 80
            ? 'text-success'
            : score >= 50
              ? 'text-warning'
              : 'text-danger';

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative size-32">
                <svg
                    className="size-full -rotate-90"
                    viewBox="0 0 120 120"
                >
                    <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-surface-2"
                    />
                    <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className={`${color} transition-all duration-700`}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-extrabold tabular-nums tracking-tight text-text-primary">
                        {score}
                    </span>
                </div>
            </div>
            <span className="text-xs font-medium text-text-secondary">
                Health Score
            </span>
        </div>
    );
}
