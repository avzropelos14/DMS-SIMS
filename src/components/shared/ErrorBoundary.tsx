import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Safety net: if a screen crashes while drawing, show a message in its place instead of a
// blank page. "section" sits inside a portal (the menu keeps working, and switching to
// another page clears it through resetKey); "page" is the last resort around the whole app.

interface Props {
    children: ReactNode;
    variant?: "section" | "page";
    resetKey?: string;
}

interface State {
    failed: boolean;
    failedKey?: string;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): Partial<State> {
        return { failed: true };
    }

    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        // Moving to another page gives that page a fresh start.
        if (state.failed && state.failedKey !== undefined && (props.resetKey ?? "") !== state.failedKey) {
            return { failed: false, failedKey: undefined };
        }
        return null;
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Screen crashed", error, info.componentStack);
        this.setState({ failedKey: this.props.resetKey ?? "" });
    }

    private retry = () => this.setState({ failed: false, failedKey: undefined });

    render() {
        if (!this.state.failed) return this.props.children;

        const page = this.props.variant === "page";
        const card = (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-md w-full text-center" role="alert">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle className="w-6 h-6 text-amber-700" />
                </div>
                <h2 className="text-lg font-semibold text-[#1a2b4a] mb-1">Something went wrong</h2>
                <p className="text-sm text-[#6b6456] mb-5">
                    {page
                        ? "This page couldn't be shown. Reloading usually fixes it; nothing you saved was lost."
                        : "This part of the page couldn't be shown. Nothing you saved was lost. You can try again, reload, or use the menu to go to another page."}
                </p>
                <div className="flex gap-2">
                    {!page && (
                        <button onClick={this.retry} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-[#1a2b4a] bg-white">
                            Try again
                        </button>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a2b4a] text-white rounded-lg text-sm font-medium"
                    >
                        <RefreshCw className="w-4 h-4" /> Reload
                    </button>
                </div>
            </div>
        );

        return page
            ? <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">{card}</div>
            : <div className="flex justify-center py-12">{card}</div>;
    }
}
