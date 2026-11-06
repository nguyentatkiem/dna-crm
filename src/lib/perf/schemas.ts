import { z } from "zod";

export const TeamBody = z.object({
  name: z.string().min(1, "Nhập tên đội").max(80),
  leader: z.string().max(120).optional(),
  members: z.array(z.string().max(120)).max(100).optional(),
  color: z.string().max(9).optional(),
});
