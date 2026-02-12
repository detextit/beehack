import { ProfilePage } from "@/components/beehive/profile-page"

type ProfileRouteProps = {
  params: Promise<{
    handle: string
  }>
}

export default async function ProfileRoute({ params }: ProfileRouteProps) {
  const { handle } = await params
  return <ProfilePage handle={handle} />
}
