export async function register() {
  // Import nằm trong if để bản Edge bỏ hẳn nhánh này (jobs kéo theo module node:*).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobs } = await import("./lib/jobs");
    startJobs();
  }
}
