import { db, eq } from "@repo/database";
import { usersTable } from "@repo/database/schema";

class UserService {
  public async deleteUser(id: string): Promise<void> {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
}

export default UserService;
