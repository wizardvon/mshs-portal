import { Bell, CheckCheck, Loader2, Send, Smartphone, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import {
  canUseDeviceNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerDeviceForNotifications,
  sendPortalNotification,
  subscribeForegroundPushNotifications,
  subscribeNotifications,
  type PortalNotification,
} from "../services/notificationService";
import type { UserRole } from "../types";
import { getRoleLabel } from "../utils/accessControl";

const audienceOptions: Array<{ value: "all" | UserRole; label: string }> = [
  { value: "all", label: "Everyone" },
  { value: "principal", label: "Principal" },
  { value: "master_teacher", label: "Master Teachers" },
  { value: "teacher", label: "Teachers" },
  { value: "registrar", label: "Registrar" },
  { value: "administrative_officer", label: "Administrative Officers" },
  { value: "administrative_assistant", label: "Administrative Assistants" },
  { value: "admin", label: "Admins" },
  { value: "super_admin", label: "Super Admins" },
];

function formatNotificationTime(value: unknown) {
  if (!value || typeof value !== "object" || !("toDate" in value)) {
    return "";
  }

  const date = (value as { toDate: () => Date }).toDate();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function showDeviceNotification(notification: Pick<PortalNotification, "title" | "body" | "href">) {
  if (!canUseDeviceNotifications() || Notification.permission !== "granted" || document.visibilityState === "visible") {
    return;
  }

  const shown = new Notification(notification.title, {
    body: notification.body,
    icon: "/mshs-portal-icon.png",
    badge: "/mshs-portal-icon.png",
    data: { href: notification.href || "/dashboard" },
  });

  shown.onclick = () => {
    window.focus();
    if (notification.href) {
      window.location.assign(notification.href);
    }
    shown.close();
  };
}

export function NotificationCenter() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [deviceStatus, setDeviceStatus] = useState(
    canUseDeviceNotifications() ? Notification.permission : "unsupported",
  );
  const [busy, setBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sendForm, setSendForm] = useState({
    title: "",
    body: "",
    href: "/dashboard",
    audience: "all" as "all" | UserRole,
  });
  const canSend = profile?.role === "super_admin" || profile?.role === "admin";
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  useEffect(() => {
    if (!profile) {
      return undefined;
    }

    return subscribeNotifications(profile.userId, (nextNotifications) => {
      setNotifications(nextNotifications);
    });
  }, [profile]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    subscribeForegroundPushNotifications((payload) => {
      showDeviceNotification({
        title: payload.title,
        body: payload.body,
        href: payload.href,
      });
    }).then((nextUnsubscribe) => {
      unsubscribe = nextUnsubscribe;
    });

    return () => unsubscribe?.();
  }, []);

  if (!profile) {
    return null;
  }

  async function handleEnableDeviceNotifications() {
    if (!profile) {
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await registerDeviceForNotifications(profile);
      setDeviceStatus(Notification.permission);
      setMessage("Device notifications are enabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable device notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenNotification(notification: PortalNotification) {
    if (!profile) {
      return;
    }

    if (!notification.read) {
      await markNotificationRead(profile.userId, notification.notificationId);
    }
    setOpen(false);
    if (notification.href) {
      navigate(notification.href);
    }
  }

  async function handleMarkAllRead() {
    if (!profile) {
      return;
    }

    setBusy(true);
    try {
      await markAllNotificationsRead(profile.userId, notifications);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !sendForm.title.trim() || !sendForm.body.trim()) {
      return;
    }

    setSendBusy(true);
    setMessage("");
    try {
      const count = await sendPortalNotification({
        title: sendForm.title,
        body: sendForm.body,
        href: sendForm.href,
        audience: sendForm.audience,
        sender: profile,
      });
      setMessage(`Notification sent to ${count} ${count === 1 ? "user" : "users"}.`);
      setSendForm((current) => ({ ...current, title: "", body: "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send notification.");
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        aria-label="Notifications"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-red-100 bg-white text-civic shadow-sm transition hover:bg-red-50"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-signal px-1 text-[11px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">Notifications</p>
              <p className="text-xs text-slate-500">{getRoleLabel(profile.role)}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label="Mark all as read"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-civic disabled:opacity-50"
                disabled={!unreadCount || busy}
                onClick={handleMarkAllRead}
                title="Mark all as read"
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <CheckCheck size={16} />}
              </button>
              <button
                aria-label="Close notifications"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-civic"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            <div className="border-b border-slate-100 p-3">
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-civic transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy || deviceStatus === "granted" || deviceStatus === "unsupported"}
                onClick={handleEnableDeviceNotifications}
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <Smartphone size={16} />}
                {deviceStatus === "granted"
                  ? "Device notifications enabled"
                  : deviceStatus === "unsupported"
                    ? "Device notifications unsupported"
                    : "Enable device notifications"}
              </button>
              {message && <p className="mt-2 text-xs leading-5 text-slate-500">{message}</p>}
            </div>

            {canSend && (
              <form className="space-y-2 border-b border-slate-100 p-3" onSubmit={handleSendNotification}>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-civic focus:ring-2 focus:ring-red-100"
                    onChange={(event) => setSendForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Title"
                    value={sendForm.title}
                  />
                  <select
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-civic focus:ring-2 focus:ring-red-100"
                    onChange={(event) =>
                      setSendForm((current) => ({
                        ...current,
                        audience: event.target.value as "all" | UserRole,
                      }))
                    }
                    value={sendForm.audience}
                  >
                    {audienceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="min-h-20 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-civic focus:ring-2 focus:ring-red-100"
                  onChange={(event) => setSendForm((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Message"
                  value={sendForm.body}
                />
                <div className="flex gap-2">
                  <input
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-civic focus:ring-2 focus:ring-red-100"
                    onChange={(event) => setSendForm((current) => ({ ...current, href: event.target.value }))}
                    placeholder="/dashboard"
                    value={sendForm.href}
                  />
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-civic px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-wine disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={sendBusy || !sendForm.title.trim() || !sendForm.body.trim()}
                    type="submit"
                  >
                    {sendBusy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    Send
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {notifications.length ? (
                notifications.map((notification) => (
                  <button
                    className={[
                      "block w-full px-4 py-3 text-left transition hover:bg-red-50",
                      notification.read ? "bg-white" : "bg-red-50/60",
                    ].join(" ")}
                    key={notification.notificationId}
                    onClick={() => handleOpenNotification(notification)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-ink">{notification.title}</p>
                      {!notification.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{notification.body}</p>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {formatNotificationTime(notification.createdAt)}
                    </p>
                  </button>
                ))
              ) : (
                <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
