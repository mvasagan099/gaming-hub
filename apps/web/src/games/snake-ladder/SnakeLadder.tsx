import React from "react";
import { SnakeLadderPage } from "./SnakeLadderPage";

interface SnakeLadderProps {
  mode?: "ai" | "multiplayer";
  stake?: number;
  onBack?: () => void;
}

export const SnakeLadder: React.FC<SnakeLadderProps> = (props) => {
  return <SnakeLadderPage {...props} />;
};

export default SnakeLadder;
