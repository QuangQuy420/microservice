interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading..." }: LoadingStateProps) {
  return (
    <p role="status" className="my-[1em] text-text-muted">
      {label}
    </p>
  );
}
