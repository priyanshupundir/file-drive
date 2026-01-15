import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/clerk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payloadString = await request.text();
    const headers = request.headers;

    try {
      const result = await ctx.runAction(internal.clerk.fulfill, {
        payload: payloadString,
        headers: {
          "svix-id": headers.get("svix-id")!,
          "svix-timestamp": headers.get("svix-timestamp")!,
          "svix-signature": headers.get("svix-signature")!,
        },
      });

      // ⛔️ FIX: Correct tokenIdentifier format for Clerk
      const tokenIdentifier = `clerk|${result.data.id}`;
      
      // Only access first_name/last_name if it's a user event
      let fullName = "";
      const userData = result.data as any;
      if (userData.first_name || userData.last_name) {
        fullName = `${userData.first_name ?? ""} ${userData.last_name ?? ""}`.trim();
      }

      switch (result.type) {
        case "user.created":
          await ctx.runMutation(internal.users.createUser, {
            tokenIdentifier,
            name: fullName,
            image: result.data.image_url || "",
          });
          break;

        case "user.updated":
          await ctx.runMutation(internal.users.updateUser, {
            tokenIdentifier,
            name: fullName,
            image: result.data.image_url || "",
          });
          break;

        case "organizationMembership.created":
          await ctx.runMutation(internal.users.addOrgIdToUser, {
            tokenIdentifier: `clerk|${result.data.public_user_data.user_id}`,
            orgId: result.data.organization.id,
            role: result.data.role === "org:admin" ? "admin" : "member",
          });
          break;

        case "organizationMembership.updated":
          await ctx.runMutation(internal.users.updateRoleInOrgForUser, {
            tokenIdentifier: `clerk|${result.data.public_user_data.user_id}`,
            orgId: result.data.organization.id,
            role: result.data.role === "org:admin" ? "admin" : "member",
          });
          break;
      }

      return new Response(null, { status: 200 });
    } catch (err) {
      console.error("Webhook Error", err);
      return new Response("Webhook Error", { status: 400 });
    }
  }),
});

export default http;