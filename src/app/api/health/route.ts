export async function GET() {
  return Response.json({
    app: "our-wedding-map",
    storage: "sqlite",
    directory: process.cwd(),
  });
}
