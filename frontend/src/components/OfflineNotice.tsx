import { useOnlineStatus } from "../hooks/useOnlineStatus";
import clsx from "clsx";

interface OfflineNoticeProps {
  className?: string;
  message?: string;
}

export function OfflineNotice({ className, message = "You are offline. Some features may be unavailable." }: OfflineNoticeProps) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className={clsx("bg-yellow-100 text-yellow-800 text-center py-2 text-sm", className)}>
      {message}
    </div>
  );
}
