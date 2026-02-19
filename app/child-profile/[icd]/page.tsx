import ChildProfileClient from "./child-profile-client";

export default async function ChildProfilePage({
  params,
}: {
  params: Promise<{ icd: string }>;
}) {
  const { icd } = await params;
  return <ChildProfileClient icd={icd} />;
}

