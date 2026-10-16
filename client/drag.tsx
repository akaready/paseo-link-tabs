import { useRef, type ReactNode } from "react";
import { PanResponder, View, type ViewProps } from "react-native";

interface DragRowProps extends ViewProps {
  children: ReactNode;
  /** The row's view, for measuring where it is. */
  nodeRef?: (node: View | null) => void;
  /** Rearranging: a press anywhere on the row picks it up. Otherwise the row doesn't drag. */
  active: boolean;
  onStart(): void;
  /** How far the pointer has moved down since the press; negative is up. */
  onMove(dy: number): void;
  onEnd(dy: number): void;
}

/**
 * A row that drags up and down while the list is being rearranged. It takes the press in the
 * capture phase, before the link inside or the scrolling list around it can, which is what lets a
 * finger drag it on a touch screen.
 */
export function DragRow({
  nodeRef,
  active,
  onStart,
  onMove,
  onEnd,
  children,
  ...view
}: DragRowProps) {
  // The responder is made once, so a drag survives the re-renders it causes.
  const latest = useRef({ active, onStart, onMove, onEnd });
  latest.current = { active, onStart, onMove, onEnd };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => latest.current.active,
      onMoveShouldSetPanResponderCapture: () => latest.current.active,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => latest.current.onStart(),
      onPanResponderMove: (_, { dy }) => latest.current.onMove(dy),
      onPanResponderRelease: (_, { dy }) => latest.current.onEnd(dy),
      onPanResponderTerminate: (_, { dy }) => latest.current.onEnd(dy),
    }),
  ).current;
  return (
    <View ref={nodeRef} {...view} {...responder.panHandlers}>
      {children}
    </View>
  );
}
