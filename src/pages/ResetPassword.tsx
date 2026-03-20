import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Music2 } from "lucide-react";
import { OtpResetForm } from "@/components/reset-password/OtpResetForm";
import { LinkResetForm } from "@/components/reset-password/LinkResetForm";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const emailFromQuery = searchParams.get("email") || "";

  // OTP mode: user came from login page after requesting a code
  if (mode === "otp") {
    return <OtpResetForm initialEmail={emailFromQuery} />;
  }

  // Link mode: user clicked a link from their email (legacy support)
  return <LinkResetForm />;
}
