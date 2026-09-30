"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  assignNfcTag,
  getNfcInventory,
  NfcRequestError,
  registerNfcTag,
  rotateNfcTag,
  setNfcTagActive,
  type NfcInventory,
  type NfcProgrammingResult,
} from "@/lib/nfc-tags-client";
import { createBrowserClient } from "@/lib/supabase/browser";

export type NfcAssignmentTarget = { id: number; orderNumber: string };

type NfcTagManagerProps = {
  restaurantId: number;
  assignmentTarget?: NfcAssignmentTarget;
  onAssignmentTargetChange: (target?: NfcAssignmentTarget) => void;
  onInventoryChange: (inventory: NfcInventory) => void;
};

const emptyInventory: NfcInventory = { tags: [], orderStates: [] };

export function NfcTagManager({
  restaurantId,
  assignmentTarget,
  onAssignmentTargetChange,
  onInventoryChange,
}: NfcTagManagerProps) {
  const client = useMemo(() => createBrowserClient(), []);
  const [inventory, setInventory] = useState<NfcInventory>(emptyInventory);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<number>();
  const [programming, setProgramming] = useState<NfcProgrammingResult>();
  const [message, setMessage] = useState<string>();

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getNfcInventory(client, restaurantId);
      setInventory(result);
      onInventoryChange(result);
      setMessage(undefined);
    } catch {
      setMessage("No pudimos cargar las tarjetas NFC.");
    } finally {
      setLoading(false);
    }
  }, [client, onInventoryChange, restaurantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInventory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInventory]);
  useEffect(() => {
    const refresh = () => void loadInventory();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadInventory]);
  useEffect(() => {
    if (!assignmentTarget) return;
    const timer = window.setTimeout(() => void loadInventory(), 0);
    return () => window.clearTimeout(timer);
  }, [assignmentTarget, loadInventory]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage(undefined);
    const form = event.currentTarget;
    const label = String(new FormData(form).get("label") ?? "");
    try {
      const result = await registerNfcTag(client, restaurantId, label);
      setProgramming(result);
      form.reset();
      await loadInventory();
    } catch (error) {
      setMessage(
        error instanceof NfcRequestError && error.code === "NFC_TAG_CONFLICT"
          ? "Ya existe una tarjeta con ese nombre."
          : "No pudimos registrar la tarjeta.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function rotate(tagId: number) {
    if (
      !window.confirm(
        "El enlace anterior dejará de funcionar y tendrás que volver a escribir la tarjeta. ¿Continuar?",
      )
    )
      return;
    setWorking(true);
    setMessage(undefined);
    try {
      setProgramming(await rotateNfcTag(client, tagId));
      await loadInventory();
    } catch {
      setMessage("No pudimos rotar el enlace de la tarjeta.");
    } finally {
      setWorking(false);
    }
  }

  async function toggle(tagId: number, active: boolean) {
    if (
      !active &&
      !window.confirm(
        "Desactivar la tarjeta liberará cualquier asignación pendiente. ¿Continuar?",
      )
    )
      return;
    setWorking(true);
    setMessage(undefined);
    try {
      await setNfcTagActive(client, tagId, active);
      await loadInventory();
    } catch {
      setMessage("No pudimos cambiar el estado de la tarjeta.");
    } finally {
      setWorking(false);
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignmentTarget || !selectedTagId) return;
    const tag = inventory.tags.find(
      (candidate) => candidate.id === selectedTagId,
    );
    const orderPending = inventory.orderStates.find(
      (state) =>
        state.orderId === assignmentTarget.id && state.status === "PENDING",
    );
    let force = Boolean(
      (tag?.assignment && tag.assignment.orderId !== assignmentTarget.id) ||
        (orderPending && orderPending.tagId !== selectedTagId),
    );
    if (
      force &&
      !window.confirm(
        "Esta acción reemplazará una asignación NFC pendiente. El QR del pedido anterior seguirá funcionando. ¿Continuar?",
      )
    )
      return;

    setWorking(true);
    setMessage(undefined);
    try {
      await assignNfcTag(client, selectedTagId, assignmentTarget.id, force);
    } catch (error) {
      if (
        error instanceof NfcRequestError &&
        ["NFC_TAG_ALREADY_ASSIGNED", "ORDER_ALREADY_HAS_NFC_TAG"].includes(
          error.code,
        )
      ) {
        force = window.confirm(
          "La disponibilidad cambió en otro dispositivo. ¿Quieres reemplazar la asignación pendiente?",
        );
        if (!force) {
          setWorking(false);
          return;
        }
        try {
          await assignNfcTag(client, selectedTagId, assignmentTarget.id, true);
        } catch {
          setMessage(
            "No pudimos asignar la tarjeta. Actualiza e inténtalo de nuevo.",
          );
          setWorking(false);
          return;
        }
      } else {
        setMessage(
          error instanceof NfcRequestError && error.code === "ORDER_NOT_ACTIVE"
            ? "El pedido ya fue cerrado y no admite una tarjeta NFC."
            : "No pudimos asignar la tarjeta.",
        );
        setWorking(false);
        return;
      }
    }

    await loadInventory();
    setWorking(false);
    setSelectedTagId(undefined);
    onAssignmentTargetChange(undefined);
  }

  async function copyProgrammingUrl() {
    if (!programming) return;
    try {
      await navigator.clipboard.writeText(programming.programmingUrl);
      setMessage("Enlace copiado. Ya puedes escribirlo en NFC Tools.");
    } catch {
      setMessage(
        "No pudimos copiarlo automáticamente. Mantén pulsado el enlace para copiarlo.",
      );
    }
  }

  return (
    <section className="nfc-manager" aria-labelledby="nfc-manager-title">
      <header className="nfc-manager-header">
        <div>
          <p className="eyebrow">acceso con un toque</p>
          <h2 id="nfc-manager-title">Tarjetas NFC</h2>
          <p>
            Programa cada NTAG215 una sola vez y asígnala después de crear el
            pedido.
          </p>
        </div>
        <button
          className="refresh-button"
          type="button"
          disabled={loading}
          onClick={() => void loadInventory()}
        >
          ↻ Actualizar tarjetas
        </button>
      </header>

      {message && (
        <p className="nfc-feedback" role="status">
          {message}
        </p>
      )}
      {programming && (
        <div className="nfc-programming" role="status">
          <div>
            <strong>Programa {programming.label}</strong>
            <p>
              Este enlace solo se muestra ahora. En iPhone abre NFC Tools →
              Escribir → Añadir registro → URL, pega el enlace y pulsa Escribir.
            </p>
          </div>
          <code>{programming.programmingUrl}</code>
          <div className="nfc-programming-actions">
            <button
              className="button button-accent"
              type="button"
              onClick={() => void copyProgrammingUrl()}
            >
              Copiar enlace
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => setProgramming(undefined)}
            >
              Ya la programé
            </button>
          </div>
        </div>
      )}

      <div className="nfc-manager-grid">
        <form className="nfc-register-form" onSubmit={register}>
          <h3>Registrar una tarjeta</h3>
          <label>
            Nombre visible
            <input
              name="label"
              required
              maxLength={48}
              placeholder="Tarjeta 01"
            />
          </label>
          <button className="button button-accent" disabled={working}>
            Registrar y obtener enlace
          </button>
        </form>

        <div className="nfc-tag-list">
          {loading ? (
            <p>Cargando tarjetas…</p>
          ) : inventory.tags.length === 0 ? (
            <p className="column-empty">Aún no hay tarjetas registradas.</p>
          ) : (
            inventory.tags.map((tag) => (
              <article className="nfc-tag-row" key={tag.id}>
                <div>
                  <strong>{tag.label}</strong>
                  <p>
                    {!tag.active
                      ? "Desactivada"
                      : tag.assignment
                        ? `Asignada al pedido #${tag.assignment.orderNumber}`
                        : "Disponible"}
                  </p>
                </div>
                <div className="nfc-tag-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={working}
                    onClick={() => void rotate(tag.id)}
                  >
                    Rotar enlace
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={working}
                    onClick={() => void toggle(tag.id, !tag.active)}
                  >
                    {tag.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {assignmentTarget && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="cancel-dialog nfc-assign-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nfc-assign-title"
          >
            <p className="eyebrow">asignar tarjeta</p>
            <h2 id="nfc-assign-title">
              Pedido #{assignmentTarget.orderNumber}
            </h2>
            <p>
              El primer toque abrirá el seguimiento y dejará la tarjeta
              disponible inmediatamente.
            </p>
            <form className="login-form" onSubmit={assign}>
              <label>
                Tarjeta NFC
                <select
                  required
                  value={selectedTagId ?? ""}
                  onChange={(event) =>
                    setSelectedTagId(Number(event.target.value) || undefined)
                  }
                >
                  <option value="">Selecciona una tarjeta</option>
                  {inventory.tags
                    .filter((tag) => tag.active)
                    .map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.label}
                        {tag.assignment
                          ? ` · Pedido #${tag.assignment.orderNumber}`
                          : " · Disponible"}
                      </option>
                    ))}
                </select>
              </label>
              <div className="dialog-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => onAssignmentTargetChange(undefined)}
                >
                  Volver
                </button>
                <button
                  className="button button-accent"
                  disabled={working || !selectedTagId}
                >
                  {working ? "Asignando…" : "Asignar tarjeta"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
