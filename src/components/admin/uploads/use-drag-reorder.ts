"use client";

import { useState, type DragEvent } from "react";

// Drag one item of a list onto another to move it there (docs/admin-upload-layout-plan.md).
// Mouse only: every list that uses this also has Move earlier / Move later buttons.

type DragReorderOptions = { onMove: (move: { from: number; to: number }) => void; isDisabled?: boolean };

export function useDragReorder({ onMove, isDisabled = false }: DragReorderOptions) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setTargetIndex(null);
  };

  const getHandleProps = (index: number) => ({
    draggable: !isDisabled,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = "move";
      setDraggedIndex(index);
    },
    onDragEnd: handleDragEnd,
  });

  const getTargetProps = (index: number) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      setTargetIndex(index);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      if (draggedIndex !== index) onMove({ from: draggedIndex, to: index });
      handleDragEnd();
    },
  });

  return { draggedIndex, targetIndex, getHandleProps, getTargetProps };
}
