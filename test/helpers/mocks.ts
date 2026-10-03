import { vi } from "vitest";

// Efeitos externos ficam desligados nos testes: push, e-mail e APIs de terceiros.
vi.mock("../../src/services/notify.service", () => ({ notifyUser: vi.fn(async () => undefined) }));
vi.mock("../../src/services/push.service", () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock("../../src/services/adminNotification.service", () => ({ notifyAdmins: vi.fn(async () => undefined) }));
vi.mock("../../src/services/gameAvailability.service", () => ({
  notifyGameBackAvailable: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/holiday.service", () => ({ getHolidaysByYear: vi.fn(async () => []) }));
