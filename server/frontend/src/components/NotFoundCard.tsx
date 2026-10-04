import { ReactNode } from "react";
import { useNavigate, type To } from "react-router-dom";
import { Button, Card, EmptyState } from "@stefgo/react-ui-components";

interface NotFoundCardProps {
    title: string;
    /** What was looked for and not found. */
    children: ReactNode;
    /** Where the button leads, and what it says. */
    backTo: To;
    backLabel: string;
}

/**
 * A page whose subject does not exist. It says so and offers the way back to the list the
 * subject would be in -- some pages used to show a line of grey text and leave the visitor
 * to find the way out themselves.
 *
 * The library's `EmptyState` inside a card; what stays here is the router, which the
 * library does not know.
 */
export const NotFoundCard = ({ title, children, backTo, backLabel }: NotFoundCardProps) => {
    const navigate = useNavigate();

    return (
        <Card title={title} padding="md">
            <EmptyState
                title={children}
                action={
                    <Button variant="secondary" onClick={() => navigate(backTo)}>
                        {backLabel}
                    </Button>
                }
            />
        </Card>
    );
};
