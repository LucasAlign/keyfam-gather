ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_sender_check"
CHECK (num_nonnulls("senderId", "eventHostId") = 1);
