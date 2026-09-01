export interface Game {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  image?: string;
  category: "Board" | "Arcade" | "Sports";
  multiplayer: boolean;
  featured: boolean;
}
