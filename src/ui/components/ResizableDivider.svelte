<script lang="ts">
  interface Props {
    onResize: (percentage: number) => void;
    orientation?: 'horizontal' | 'vertical';
  }

  let { onResize, orientation = 'horizontal' }: Props = $props();

  let isDragging = $state(false);

  function handleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    isDragging = true;

    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDragging) return;

      const parent = (event.target as HTMLElement).parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();

      if (orientation === 'horizontal') {
        // Calculate percentage from bottom (for tabs panel)
        const mouseY = e.clientY;
        const distanceFromTop = mouseY - rect.top;
        const totalHeight = rect.height;

        // We want the percentage for the bottom panel (tabs)
        // So we calculate from the divider position to the bottom
        const percentageForBottomPanel = ((totalHeight - distanceFromTop) / totalHeight) * 100;

        // Clamp between 20% and 80% to prevent panels from being too small
        const clampedPercentage = Math.max(20, Math.min(80, percentageForBottomPanel));
        onResize(clampedPercentage);
      } else {
        // For vertical orientation (left/right panels)
        const mouseX = e.clientX;
        const distanceFromLeft = mouseX - rect.left;
        const totalWidth = rect.width;
        const percentageForRightPanel = ((totalWidth - distanceFromLeft) / totalWidth) * 100;
        const clampedPercentage = Math.max(20, Math.min(80, percentageForRightPanel));
        onResize(clampedPercentage);
      }
    };

    const handleMouseUp = (): void => {
      isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }
</script>

<div
  class="resizable-divider"
  class:horizontal={orientation === 'horizontal'}
  class:vertical={orientation === 'vertical'}
  class:dragging={isDragging}
  onmousedown={handleMouseDown}
  role="separator"
  aria-orientation={orientation}
  tabindex="0"
></div>

<style>
  .resizable-divider {
    position: relative;
    flex-shrink: 0;
    user-select: none;
    transition: background-color 0.2s;
  }

  .resizable-divider.horizontal {
    height: 4px;
    cursor: ns-resize;
    background-color: #3e3e42;
  }

  .resizable-divider.vertical {
    width: 4px;
    cursor: ew-resize;
    background-color: #3e3e42;
  }

  .resizable-divider:hover,
  .resizable-divider.dragging {
    background-color: #007acc;
  }

  .resizable-divider:focus {
    outline: 2px solid #007acc;
    outline-offset: -2px;
  }

  /* Visual indicator when dragging */
  .resizable-divider.dragging {
    z-index: 1000;
  }
</style>
