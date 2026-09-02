export default function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`app-icon ${className}`}>{name}</span>;
}
