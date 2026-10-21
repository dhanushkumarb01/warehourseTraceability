const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Truck Traceability Demo Data...');

  // 1. Create Trucks
  const trucksData = [
    { truckNumber: 'TS09AB1234', driverName: 'Rajesh Kumar', driverContact: '9876543210', transporter: 'VRL Logistics', vehicleType: '16-Wheeler', rfidTag: 'TAG-TS09-1234' },
    { truckNumber: 'TS10CD5678', driverName: 'Suresh Singh', driverContact: '9876543211', transporter: 'Gati Express', vehicleType: '10-Wheeler', rfidTag: 'TAG-TS10-5678' },
    { truckNumber: 'TS11EF9012', driverName: 'Amit Patel', driverContact: '9876543212', transporter: 'Delhivery Freight', vehicleType: '14-Wheeler', rfidTag: 'TAG-TS11-9012' },
    { truckNumber: 'TS12GH3456', driverName: 'Vijay Sharma', driverContact: '9876543213', transporter: 'Safexpress', vehicleType: '18-Wheeler', rfidTag: 'TAG-TS12-3456' },
    { truckNumber: 'TS13JK7890', driverName: 'Anil Yadav', driverContact: '9876543214', transporter: 'Blue Dart', vehicleType: '16-Wheeler', rfidTag: 'TAG-TS13-7890' },
  ];

  const trucks = [];
  for (const data of trucksData) {
    const truck = await prisma.truck.upsert({
      where: { truckNumber: data.truckNumber },
      update: {},
      create: data,
    });
    trucks.push(truck);
  }
  console.log(`Created ${trucks.length} trucks.`);

  // 2. Create RFID Readers
  const readersData = [
    { readerCode: 'ENTRY-RDR-01', readerName: 'Main Entry Gate Reader', stage: 'ENTRY_GATE', ipAddress: '192.168.1.101', location: 'Gate 1 - Inbound', status: 'ONLINE' },
    { readerCode: 'WB1-RDR-01', readerName: 'Inbound Weigh Bridge Reader', stage: 'WEIGH_BRIDGE_1', ipAddress: '192.168.1.102', location: 'Weigh Bridge 1', status: 'ONLINE' },
    { readerCode: 'DOCK-RDR-01', readerName: 'Loading Dock A Reader', stage: 'LOADING_DOCK', ipAddress: '192.168.1.103', location: 'Dock Area A', status: 'ONLINE' },
    { readerCode: 'WB2-RDR-01', readerName: 'Outbound Weigh Bridge Reader', stage: 'WEIGH_BRIDGE_2', ipAddress: '192.168.1.104', location: 'Weigh Bridge 2', status: 'ONLINE' },
    { readerCode: 'INV-RDR-01', readerName: 'Invoice Checkpost Reader', stage: 'INVOICE', ipAddress: '192.168.1.105', location: 'Dispatch Office', status: 'ONLINE' },
    { readerCode: 'PARK-RDR-01', readerName: 'Yard Parking Reader', stage: 'PARKING', ipAddress: '192.168.1.106', location: 'Parking Zone 1', status: 'ONLINE' },
    { readerCode: 'EXIT-RDR-01', readerName: 'Main Exit Gate Reader', stage: 'EXIT_GATE', ipAddress: '192.168.1.107', location: 'Gate 2 - Outbound', status: 'ONLINE' },
  ];

  const readers = {};
  for (const data of readersData) {
    const reader = await prisma.rFIDReader.upsert({
      where: { readerCode: data.readerCode },
      update: { status: 'ONLINE', lastHeartbeat: new Date() },
      create: { ...data, lastHeartbeat: new Date() },
    });
    readers[data.stage] = reader;
  }
  console.log(`Created ${Object.keys(readers).length} RFID readers.`);

  // Helper to create events
  async function simulateEvent(visitId, truckId, stage, minutesOffset) {
    const reader = readers[stage];
    const eventTime = new Date(Date.now() - minutesOffset * 60000);
    
    await prisma.truckEvent.create({
      data: {
        visitId,
        truckId,
        stage,
        readerId: reader?.id,
        source: 'SIMULATED',
        eventTime,
        createdAt: eventTime
      }
    });
  }

  // Helper to create a visit
  async function createVisit(truck, status, currentStage, entryMinutesAgo) {
    const entryTime = new Date(Date.now() - entryMinutesAgo * 60000);
    const visitNumber = `VN-${Date.now()}-${truck.truckNumber}`;
    
    return await prisma.truckVisit.create({
      data: {
        visitNumber,
        truckId: truck.id,
        status,
        currentStage,
        entryTime,
        createdAt: entryTime,
        updatedAt: entryTime,
      }
    });
  }

  // Scenario 1 — Normal Completed Journey (TS09AB1234)
  const v1 = await createVisit(trucks[0], 'EXITED', 'EXIT_GATE', 120);
  await simulateEvent(v1.id, trucks[0].id, 'ENTRY_GATE', 120);
  await simulateEvent(v1.id, trucks[0].id, 'WEIGH_BRIDGE_1', 115);
  await simulateEvent(v1.id, trucks[0].id, 'LOADING_DOCK', 100);
  await simulateEvent(v1.id, trucks[0].id, 'WEIGH_BRIDGE_2', 40);
  await simulateEvent(v1.id, trucks[0].id, 'INVOICE', 30);
  await simulateEvent(v1.id, trucks[0].id, 'EXIT_GATE', 10);
  await prisma.truckVisit.update({
    where: { id: v1.id },
    data: { exitTime: new Date(Date.now() - 10 * 60000) }
  });

  // Scenario 2 — Parked After Invoice (TS10CD5678)
  const v2 = await createVisit(trucks[1], 'PARKED', 'PARKING', 90);
  await simulateEvent(v2.id, trucks[1].id, 'ENTRY_GATE', 90);
  await simulateEvent(v2.id, trucks[1].id, 'WEIGH_BRIDGE_1', 85);
  await simulateEvent(v2.id, trucks[1].id, 'LOADING_DOCK', 75);
  await simulateEvent(v2.id, trucks[1].id, 'WEIGH_BRIDGE_2', 30);
  await simulateEvent(v2.id, trucks[1].id, 'INVOICE', 20);
  await simulateEvent(v2.id, trucks[1].id, 'PARKING', 10);

  // Scenario 3 — Currently Loading (TS11EF9012)
  const v3 = await createVisit(trucks[2], 'ACTIVE', 'LOADING_DOCK', 60);
  await simulateEvent(v3.id, trucks[2].id, 'ENTRY_GATE', 60);
  await simulateEvent(v3.id, trucks[2].id, 'WEIGH_BRIDGE_1', 50);
  await simulateEvent(v3.id, trucks[2].id, 'LOADING_DOCK', 40);

  // Scenario 4 — Unauthorized Re-entry (TS12GH3456)
  const v4 = await createVisit(trucks[3], 'ACTIVE', 'LOADING_DOCK', 150);
  await simulateEvent(v4.id, trucks[3].id, 'ENTRY_GATE', 150);
  await simulateEvent(v4.id, trucks[3].id, 'WEIGH_BRIDGE_1', 140);
  await simulateEvent(v4.id, trucks[3].id, 'LOADING_DOCK', 100);
  await simulateEvent(v4.id, trucks[3].id, 'WEIGH_BRIDGE_2', 60);
  await simulateEvent(v4.id, trucks[3].id, 'INVOICE', 50);
  await simulateEvent(v4.id, trucks[3].id, 'LOADING_DOCK', 10); // Re-entry
  await prisma.truckAlert.create({
    data: {
      visitId: v4.id,
      truckId: trucks[3].id,
      alertType: 'UNAUTHORIZED_REENTRY',
      stage: 'LOADING_DOCK',
      message: 'Truck returned to LOADING_DOCK after reaching INVOICE.',
      createdAt: new Date(Date.now() - 10 * 60000)
    }
  });
  await prisma.truckVisit.update({
    where: { id: v4.id },
    data: { riskStatus: 'FLAGGED' }
  });

  // Scenario 5 — Sequence Violation (TS13JK7890)
  const v5 = await createVisit(trucks[4], 'ACTIVE', 'LOADING_DOCK', 45);
  await simulateEvent(v5.id, trucks[4].id, 'ENTRY_GATE', 45);
  // Skipped Weigh Bridge 1
  await simulateEvent(v5.id, trucks[4].id, 'LOADING_DOCK', 15);
  await prisma.truckAlert.create({
    data: {
      visitId: v5.id,
      truckId: trucks[4].id,
      alertType: 'SEQUENCE_VIOLATION',
      stage: 'LOADING_DOCK',
      message: 'Invalid stage progression: ENTRY_GATE → LOADING_DOCK. Expected WEIGH_BRIDGE_1.',
      createdAt: new Date(Date.now() - 15 * 60000)
    }
  });
  await prisma.truckVisit.update({
    where: { id: v5.id },
    data: { riskStatus: 'FLAGGED' }
  });

  // Scenario 6 — Delay Alert (Use same truck as Scenario 1 for a new active visit, or update scenario 3)
  // Let's create a new truck for Delay Alert to keep scenarios isolated
  const delayedTruck = await prisma.truck.upsert({
    where: { truckNumber: 'TS14MN5678' },
    update: {},
    create: { truckNumber: 'TS14MN5678', driverName: 'Sunil Verma', transporter: 'VRL Logistics', vehicleType: '10-Wheeler', rfidTag: 'TAG-TS14-5678' }
  });
  const v6 = await createVisit(delayedTruck, 'ACTIVE', 'WEIGH_BRIDGE_1', 300); // 5 hours ago
  await simulateEvent(v6.id, delayedTruck.id, 'ENTRY_GATE', 300);
  await simulateEvent(v6.id, delayedTruck.id, 'WEIGH_BRIDGE_1', 290);
  await prisma.truckAlert.create({
    data: {
      visitId: v6.id,
      truckId: delayedTruck.id,
      alertType: 'DELAY',
      stage: 'WEIGH_BRIDGE_1',
      message: 'Truck exceeded maximum dwell time at WEIGH_BRIDGE_1.',
      createdAt: new Date(Date.now() - 230 * 60000)
    }
  });
  await prisma.truckVisit.update({
    where: { id: v6.id },
    data: { riskStatus: 'DELAYED' }
  });

  console.log('Demo data seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
