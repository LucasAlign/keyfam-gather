import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NameTagControls } from "./name-tag-controls";

describe("NameTagControls", () => {
  it("shows only the selector required by the selected audience", () => {
    render(<NameTagControls audience={{ kind: "ALL" }} groups={[{ id: "g1", name: "Community Partners" }]} tables={[{ id: "t1", name: "Table 1" }]} />);
    expect(screen.queryByLabelText("Group")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Table")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "GROUP" } });
    expect(screen.getByLabelText("Group")).toBeVisible();
    expect(screen.queryByLabelText("Table")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "TABLE" } });
    expect(screen.queryByLabelText("Group")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Table")).toBeVisible();
  });
});
