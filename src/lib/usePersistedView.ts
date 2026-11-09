import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// Remembers each portal's current page across a page refresh, and shows it in the address bar
// (/admin/settings, /parent/pickup). The path is the first thing checked, so a refresh, a
// bookmark and the browser's Back and Forward buttons all land on the right page.
// sessionStorage is the fallback; it survives a refresh but is cleared when the tab closes
// (right for shared school computers). Only the view id is stored or put in the URL, never
// personal data. A path only ever picks a page inside the signed-in user's own portal.
const KEY_PREFIX = "sims_view_";

// Older view ids that run two words together; these read better with a hyphen in the URL.
const SLUG_OVERRIDES: Record<string, string> = {
    classmanagement: "class-management",
    guardiansecurity: "guardian-security",
    idgeneration: "id-generation",
    selfdismissal: "self-dismissal",
    teacherslist: "teachers-list",
};

const viewPath = (role: string, viewId: string) =>
    `/${role}/${SLUG_OVERRIDES[viewId] ?? viewId.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;

// The view named by the current URL, or null when it isn't one of this portal's pages.
function viewFromUrl<T extends string>(role: string, viewIds: readonly T[]): T | null {
    const path = window.location.pathname.replace(/[/]+$/, "");
    return viewIds.find((id) => viewPath(role, id) === path) ?? null;
}

// Keeps any query or hash, which a Supabase email link may still be using.
const urlWithPath = (path: string) => path + window.location.search + window.location.hash;

type NavLike = { id: string; children?: { id: string }[] };

// The navigable view ids of a DashboardLayout navigation: a group's own id is never
// a view, its children are.
export function navViewIds(navigation: NavLike[]): string[] {
    return navigation.flatMap((item) =>
        item.children?.length ? item.children.map((child) => child.id) : [item.id],
    );
}

export function usePersistedView<T extends string>(
    role: string,
    userId: string | null | undefined,
    validViewIds: readonly T[],
    defaultViewId: T,
): [T, Dispatch<SetStateAction<T>>] {
    const storageKey = `${KEY_PREFIX}${role}_${userId ?? "unknown"}`;

    const [activeView, setActiveView] = useState<T>(() => {
        const fromUrl = viewFromUrl(role, validViewIds);
        if (fromUrl) return fromUrl;
        try {
            const saved = window.sessionStorage.getItem(storageKey);
            if (saved && (validViewIds as readonly string[]).includes(saved)) return saved as T;
        } catch {
            // Storage unavailable (private mode, blocked site data): fall back to the default.
        }
        return defaultViewId;
    });

    useEffect(() => {
        try {
            window.sessionStorage.setItem(storageKey, activeView);
        } catch {
            // Not fatal: the page just won't be remembered after a refresh.
        }
    }, [storageKey, activeView]);

    // Address bar: the first sync replaces the entry (so Back never returns to a bare or
    // invalid URL); every later page change adds one, so Back returns to the previous page.
    const urlSynced = useRef(false);
    useEffect(() => {
        const target = viewPath(role, activeView);
        if (window.location.pathname !== target) {
            const method = urlSynced.current ? "pushState" : "replaceState";
            window.history[method](null, "", urlWithPath(target));
        }
        urlSynced.current = true;
    }, [role, activeView]);

    // Back and Forward. An entry that isn't a page of this portal is corrected in place.
    const viewIdsKey = validViewIds.join("|");
    useEffect(() => {
        const onPopState = () => {
            const fromUrl = viewFromUrl(role, viewIdsKey.split("|") as T[]);
            if (fromUrl) setActiveView(fromUrl);
            else window.history.replaceState(null, "", urlWithPath(viewPath(role, activeView)));
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [role, viewIdsKey, activeView]);

    return [activeView, setActiveView];
}

// Called on sign-out so the next person on this computer starts on their default page.
export function clearPersistedViews(): void {
    try {
        const keys: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
            const key = window.sessionStorage.key(i);
            if (key?.startsWith(KEY_PREFIX)) keys.push(key);
        }
        keys.forEach((key) => window.sessionStorage.removeItem(key));
    } catch {
        // Storage unavailable: nothing was stored either.
    }
    if (window.location.pathname !== "/") window.history.replaceState(null, "", urlWithPath("/"));
}
