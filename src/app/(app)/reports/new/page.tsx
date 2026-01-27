import TagesberichtForm from "./TagesberichtForm";

export default function NewTagesberichtPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Tagesbericht – Neu</h1>
      <p className="mt-2 text-gray-600">
        MVP: Eingabe + Entwurf lokal speichern
      </p>
      <TagesberichtForm />
    </main>
  );
}