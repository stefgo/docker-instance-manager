import { describe, expect, it } from "vitest";
import { listScope } from "./listScope";

describe("listScope", () => {
    it("reaches all rows while nothing narrows the list", () => {
        expect(listScope(false)).toBe("all");
    });

    it("reaches the shown rows while a search or a filter narrows it", () => {
        expect(listScope(true)).toBe("shown");
    });

    it("reaches the picked rows once something is picked, narrowed or not", () => {
        expect(listScope(false, true)).toBe("selected");
        expect(listScope(true, true)).toBe("selected");
    });
});
