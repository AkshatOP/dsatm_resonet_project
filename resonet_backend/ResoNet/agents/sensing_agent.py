"""
SensingAgent — ingests earthquake events, classifies zones, elevates agent priorities,
and triggers RFP issuance from affected specialist agents.
Acts as the system's entry point for all disaster events.
"""

import asyncio
import dataclasses
import logging
from typing import Any, Dict, List, Optional

import config
from agents.base_agent import BaseAgent
from messaging.broker import MessageBroker
from messaging.message_types import (
    Bid, EarthquakeEvent, RFP, WebSocketEvent, ZoneStatus,
)
from negotiation.protocol import ContractNetProtocol
from simulation.city_model import CityModel
from simulation.earthquake import EarthquakeSimulator
from simulation.zone_classifier import ZoneClassifier

logger = logging.getLogger(__name__)
_CNP = ContractNetProtocol()


class SensingAgent(BaseAgent):
    """
    Subscribes to earthquake events, computes zone severities,
    classifies zones, and triggers downstream agents to issue RFPs.
    """

    def __init__(
        self,
        broker: MessageBroker,
        city_model: CityModel,
        zone_classifier: ZoneClassifier,
        all_agents_ref: Dict,   # injected after all agents are created
    ) -> None:
        super().__init__(
            agent_id="sensing_agent",
            agent_type="sensing",
            broker=broker,
            initial_resources={},
            priority_weight=1.0,
        )
        self.city_model = city_model
        self.zone_classifier = zone_classifier
        self.simulator = EarthquakeSimulator()
        self.all_agents_ref = all_agents_ref
        self.current_zone_statuses: List[ZoneStatus] = []
        self.orchestrator = None  # set after orchestrator is initialized

    async def process_event(self, event: Any) -> None:
        """
        Handle an EarthquakeEvent dict (from broker callback) or EarthquakeEvent object.
        Runs the full pipeline: severity → classify → damage → notify → trigger RFPs.
        """
        if isinstance(event, dict):
            eq_event = EarthquakeEvent(**event)
        else:
            eq_event = event

        import logging as _logging
        _log = _logging.getLogger(__name__)

        _log.info("")
        _log.info("╔══════════════════════════════════════════════════════════════")
        _log.info("║ EARTHQUAKE DETECTED  M%.1f  epicenter=(%.4f, %.4f)  id=%s",
                  eq_event.magnitude, eq_event.epicenter_lat, eq_event.epicenter_lon, eq_event.event_id[:8])
        _log.info("╚══════════════════════════════════════════════════════════════")
        self.status = config.STATUS_ACTIVE

        # Compute severities and apply damage to city model
        severities = self.simulator.compute_zone_severities(eq_event, self.city_model)
        zone_statuses = self.simulator.apply_damage(eq_event, self.city_model, severities)

        # Classify all zones
        classifications = self.zone_classifier.classify_all(zone_statuses)
        for zs in zone_statuses:
            zs.classification = classifications.get(zs.zone_id, "SAFE")

        self.current_zone_statuses = zone_statuses

        # Print zone assessment table
        _log.info("[SENSING] Zone damage assessment:")
        _log.info("  %-8s  %-20s  %-8s  %-10s  %-7s  %-5s", "Zone", "Name", "Severity", "Class", "Roads", "Power")
        _log.info("  " + "─" * 70)
        zone_names = {z["id"]: z["name"] for z in config.CITY_ZONES}
        for zs in sorted(zone_statuses, key=lambda z: z.severity_score, reverse=True):
            road_str = "BLOCKED" if zs.road_blocked else "OK"
            power_str = "OFF" if not zs.power_status else "ON"
            cls_marker = {"CRITICAL": "🔴", "HIGH": "🟠", "LOW": "🟡", "SAFE": "🟢"}.get(zs.classification, "")
            _log.info("  %-8s  %-20s  %-8.2f  %s %-8s  %-7s  %-5s",
                      zs.zone_id, zone_names.get(zs.zone_id, "?"),
                      zs.severity_score, cls_marker, zs.classification,
                      road_str, power_str)

        critical = [zs.zone_id for zs in zone_statuses if zs.classification == "CRITICAL"]
        high = [zs.zone_id for zs in zone_statuses if zs.classification == "HIGH"]
        _log.info("[SENSING] Summary: %d CRITICAL zones %s | %d HIGH zones %s",
                  len(critical), critical, len(high), high)

        # Publish zone_update WebSocket events — include lat/lon so frontend
        # can place markers directly without a second GET /zones call
        zone_coords = {z["id"]: {"lat": z["lat"], "lon": z["lon"]}
                       for z in config.CITY_ZONES}
        for zs in zone_statuses:
            payload = dataclasses.asdict(zs)
            coords = zone_coords.get(zs.zone_id, {})
            payload["lat"] = coords.get("lat")
            payload["lon"] = coords.get("lon")
            ws_event = WebSocketEvent(event_type="zone_update", payload=payload)
            await self.broker.broadcast(ws_event)

        # Elevate priorities of agents whose zones are affected
        await self._elevate_priorities(zone_statuses, classifications)

        # Trigger RFP issuance from agents in CRITICAL/HIGH zones
        await self._trigger_rfps(zone_statuses, classifications, eq_event.event_id)

        # Dispatch rescue units and broadcast routes to frontend
        await self._dispatch_rescue_units(zone_statuses)

        self.status = config.STATUS_IDLE

    async def _dispatch_rescue_units(self, zone_statuses: List[ZoneStatus]) -> None:
        """
        Ask RescueCoordinator to assign units to all CRITICAL/HIGH zones
        and broadcast the assignments (with lat/lon waypoints) to the frontend.
        """
        rescue_coordinator = self.all_agents_ref.get("rescue_coordinator")
        if not rescue_coordinator:
            return

        priority_zones = [
            zs for zs in zone_statuses if zs.classification in ("CRITICAL", "HIGH")
        ]
        if not priority_zones:
            return

        ndrf = self.all_agents_ref.get("ndrf_agent")
        available = {"personnel": ndrf.resource_pool.get("personnel", 0)} if ndrf else {"personnel": 30}

        assignments = rescue_coordinator.coordinate_dispatch(priority_zones, available)
        await rescue_coordinator.broadcast_dispatch(assignments)

    async def evaluate_rfp(self, rfp: RFP) -> Optional[Bid]:
        """SensingAgent never bids on resource RFPs."""
        return None

    async def _elevate_priorities(
        self, zone_statuses: List[ZoneStatus], classifications: Dict[str, str]
    ) -> None:
        """Increase priority_weight for agents associated with CRITICAL/HIGH zones."""
        critical_zones = {zs.zone_id for zs in zone_statuses if zs.classification in ("CRITICAL", "HIGH")}
        for agent_id, agent in self.all_agents_ref.items():
            if agent_id == self.agent_id:
                continue
            # Bump all active response agents when critical zones exist
            if critical_zones and hasattr(agent, "priority_weight"):
                if agent.agent_type in ("ndrf", "hospital", "fire", "police"):
                    agent.priority_weight = min(3.0, agent.priority_weight * 1.5)
                    self._log(f"Elevated {agent_id} priority to {agent.priority_weight:.2f}")

    async def _trigger_rfps(
        self,
        zone_statuses: List[ZoneStatus],
        classifications: Dict[str, str],
        event_id: str,
    ) -> None:
        """
        Tell specialist agents to issue RFPs for affected zones.
        Agents decide what they need — SensingAgent just signals them.
        """
        if self.orchestrator is None:
            self._log("No orchestrator set — skipping RFP triggers")
            return

        import logging as _logging
        _log = _logging.getLogger(__name__)
        _log.info("[SENSING] Dispatching alerts to specialist agents...")

        hospital_agent = self.all_agents_ref.get("hospital_agent")
        ndrf_agent = self.all_agents_ref.get("ndrf_agent")
        fire_agent = self.all_agents_ref.get("fire_agent")

        # Hospital: only trigger for Zone-B (where the hospital physically is)
        hospital_zone = next(
            (zs for zs in zone_statuses if zs.zone_id == "Zone-B"
             and zs.classification in ("CRITICAL", "HIGH")),
            None,
        )
        if hospital_agent and hospital_zone:
            _log.info("[SENSING] → hospital_agent  alerted for Zone-B (%s, power=%s)",
                      hospital_zone.classification, hospital_zone.power_status)
            await hospital_agent.on_critical_zone(hospital_zone, self.orchestrator)
        else:
            _log.info("[SENSING] → hospital_agent  Zone-B is %s — no alert needed",
                      next((zs.classification for zs in zone_statuses if zs.zone_id == "Zone-B"), "SAFE"))

        # NDRF: respond to CRITICAL zones only (limits RFP flood)
        critical_zones = [zs for zs in zone_statuses if zs.classification == "CRITICAL"]
        _log.info("[SENSING] → ndrf_agent + fire_agent  responding to %d CRITICAL zone(s): %s",
                  len(critical_zones), [z.zone_id for z in critical_zones])
        for zs in critical_zones:
            if ndrf_agent:
                await ndrf_agent.on_affected_zone(zs, self.orchestrator)
            if fire_agent:
                await fire_agent.on_critical_zone(zs, self.orchestrator)
