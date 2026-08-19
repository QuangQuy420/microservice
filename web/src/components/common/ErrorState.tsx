interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <p role="alert" className="my-[1em] text-[#a92828]">
      {message}
    </p>
  );
}
