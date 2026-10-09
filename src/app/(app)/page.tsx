import { redirect } from "next/navigation";
import { requireUser, userHomeMenu } from "@/lib/auth";
import { AccessDenied } from "@/components/ui";

// Landing page after login: the first menu the account may open.
export default async function HomePage() {
  const user = await requireUser();
  const home = userHomeMenu(user);
  if (home) redirect(home.href);
  return <AccessDenied user={user} />;
}
