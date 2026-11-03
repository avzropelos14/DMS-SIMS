import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// Remembers each portal's current page across a page refresh. sessionStorage survives
// a refresh but is cleared when the tab closes (right for shared school computers).
// Only the view id is stored, never personal data.
const KEY_PREFIX = "sims_view_";

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
}
