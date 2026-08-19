import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <section aria-labelledby="register-heading">
      {/* Restores the browser default <h1> size/margin that Tailwind's preflight removes. The
          1.5em/0.83em pair (not the 2em/0.67em top-level default) is what the UA stylesheet
          applies to an <h1> nested in a sectioning element, which is how this one renders. */}
      <h1 id="register-heading" className="my-[0.83em] text-[1.5em] font-bold">
        Đăng ký
      </h1>
      <RegisterForm />
    </section>
  );
}
