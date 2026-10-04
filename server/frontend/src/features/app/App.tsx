import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider, ToastProvider } from "@stefgo/react-ui-components";

import { ThemeProvider } from "./context/ThemeProvider";
import { AuthProvider } from "../auth/AuthProvider";
import { WebSocketProvider } from "./context/WebSocketProvider";
import { queryClient } from "../../lib/queryClient";
import { router } from "./router";

/**
 * Toasts sit above the routes, not inside a page: they are raised from request callbacks
 * and from events that arrive over the WebSocket, both of which outlive the surface that
 * started them. A run asked for on the client list keeps its answer even if the operator
 * has moved on to another page by the time the agent reports.
 *
 * Confirmations sit next to them for the same reason: every page asks through
 * `useConfirm()`, and the one dialog that answers lives here.
 */
function App() {
    return (
        <ThemeProvider>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <WebSocketProvider>
                        <ToastProvider>
                            <ConfirmProvider>
                                {/* The providers above sit outside the router and use none
                                    of its hooks; what needs the location lives in a route. */}
                                <RouterProvider router={router} />
                            </ConfirmProvider>
                        </ToastProvider>
                    </WebSocketProvider>
                </AuthProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}

export default App;
