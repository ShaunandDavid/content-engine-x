Goal: wire a mock video provider so the full pipeline runs end-to-end 
without calling Sora.

Step 1: Create services/providers/mock/src/mock-provider.ts implementing 
VideoGenerationProvider. generateClip() and pollClip() return status 
"completed" immediately using https://www.w3schools.com/html/mov_bbb.mp4 
as the download URL.

Step 2: In apps/web/lib/server/clip-generation.ts, add a getVideoProvider() 
factory that returns MockProvider if process.env.CONTENT_ENGINE_VIDEO_PROVIDER 
=== "mock", otherwise SoraProvider.

Step 3: Add CONTENT_ENGINE_VIDEO_PROVIDER=mock to apps/web/.env.local

Step 4: Add CONTENT_ENGINE_USE_PYTHON_ORCHESTRATOR=true to apps/web/.env.local

Step 5: Restart the dev server, create a test project with this brief:
Title: Speed to Lead Test
Objective: Show 5-second lead response  
Audience: Home service business owners
Tone: authority / Platforms: tiktok / Duration: 30s

Step 6: Run the full pipeline and report the final stage reached, 
any errors, and whether a render was produced.
