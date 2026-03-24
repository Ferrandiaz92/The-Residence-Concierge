export async function GET() {
  return Response.json({ status: 'test works' })
}
```

Commit → wait for green → check if `test` appears in the route list → open:
```
https://theresidenceconcierge.vercel.app/api/test
