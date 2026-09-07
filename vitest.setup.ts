import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components between tests so multiple render() calls in one
// file don't leak DOM into each other.
afterEach(() => cleanup());
