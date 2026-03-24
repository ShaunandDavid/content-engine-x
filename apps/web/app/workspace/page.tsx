import { WorkspaceLayout } from "../../components/workspace/workspace-layout";
import { InfiniteCanvas } from "../../components/workspace/infinite-canvas";
import { CanvasNode } from "../../components/workspace/canvas-node";

export default function WorkspacePage() {
  return (
    <WorkspaceLayout toolbarTitle="Phase 5 // Content Assembly">
      <InfiniteCanvas>
        <CanvasNode id="1" initialX={100} initialY={150} title="Campaign Brief">
          <p style={{ fontSize: '0.85rem', color: '#555', margin: 0 }}>
            Brand: Orbital<br/>
            Target: 18-24<br/>
            Vibe: Fast, Edgy, Synthetic
          </p>
        </CanvasNode>

        <CanvasNode id="2" initialX={450} initialY={100} title="Raw Clip: Intro">
          <div style={{ width: 240, height: 135, background: '#eee', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Placeholder Video</span>
          </div>
        </CanvasNode>

        <CanvasNode id="3" initialX={200} initialY={350} title="Adam Generation Prompt">
          <div style={{ padding: 12, background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 8, fontSize: '0.85rem', color: '#333' }}>
            "Generate a 5-second B-roll clip of a glowing neon street reflecting on a wet windshield."
          </div>
        </CanvasNode>
      </InfiniteCanvas>
    </WorkspaceLayout>
  );
}
