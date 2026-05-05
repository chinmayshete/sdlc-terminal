import { login } from "../src/auth.controller";

describe("login", () => {
  it("returns a token for a valid user", async () => {
    const result = await login({ email: "demo@example.com", password: "password123" });

    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe("demo@example.com");
  });

  it("rejects invalid credentials", async () => {
    await expect(
      login({ email: "demo@example.com", password: "wrong-password" }),
    ).rejects.toThrow("Invalid credentials");
  });
});
