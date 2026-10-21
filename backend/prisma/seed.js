/**
 * Database Seed — Warehouse Bay + Material Data
 *
 * Populates:
 *   - 18 warehouse bays across Zone A, B, and C
 *   - 5 materials
 *   - 3 lots per material
 *
 * Each bay includes:
 *   - Center coordinates (latitude/longitude)
 *   - polygonCoordinates — a rectangle of 4 corners around the center
 *
 * Each material lot includes:
 *   - lotCode
 *   - quantity
 *   - unit
 *   - status
 *   - qr fields for Phase 4 testing
 *
 * Run with: npx prisma db seed
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Generate a rectangular polygon (4 corners) centered on a point.
 * Corners are returned in clockwise order: NW → NE → SE → SW.
 */
function makeBayPolygon(lat, lng, dLat = 0.000045, dLng = 0.000060) {
    return [
        [lat + dLat, lng - dLng],  // NW
        [lat + dLat, lng + dLng],  // NE
        [lat - dLat, lng + dLng],  // SE
        [lat - dLat, lng - dLng],  // SW
    ];
}

async function main() {
    const bays = [
        // ── Zone A ────────────────────────────────────────────────────────────
        {
            bayCode: 'BAY-001',
            bayName: 'Zone A Bay 1',
            zone: 'Zone A',
            latitude: 28.459500,
            longitude: 77.026600,
            polygonCoordinates: makeBayPolygon(28.459500, 77.026600),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-002',
            bayName: 'Zone A Bay 2',
            zone: 'Zone A',
            latitude: 28.459550,
            longitude: 77.026750,
            polygonCoordinates: makeBayPolygon(28.459550, 77.026750),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-003',
            bayName: 'Zone A Bay 3',
            zone: 'Zone A',
            latitude: 28.459600,
            longitude: 77.026900,
            polygonCoordinates: makeBayPolygon(28.459600, 77.026900),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-004',
            bayName: 'Zone A Bay 4',
            zone: 'Zone A',
            latitude: 28.459650,
            longitude: 77.027050,
            polygonCoordinates: makeBayPolygon(28.459650, 77.027050),
            status: 'OCCUPIED'
        },
        {
            bayCode: 'BAY-005',
            bayName: 'Zone A Bay 5',
            zone: 'Zone A',
            latitude: 28.459700,
            longitude: 77.027200,
            polygonCoordinates: makeBayPolygon(28.459700, 77.027200),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-006',
            bayName: 'Zone A Bay 6',
            zone: 'Zone A',
            latitude: 28.459750,
            longitude: 77.027350,
            polygonCoordinates: makeBayPolygon(28.459750, 77.027350),
            status: 'INACTIVE'
        },

        // ── Zone B ────────────────────────────────────────────────────────────
        {
            bayCode: 'BAY-007',
            bayName: 'Zone B Bay 1',
            zone: 'Zone B',
            latitude: 28.460100,
            longitude: 77.026600,
            polygonCoordinates: makeBayPolygon(28.460100, 77.026600),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-008',
            bayName: 'Zone B Bay 2',
            zone: 'Zone B',
            latitude: 28.460100,
            longitude: 77.026750,
            polygonCoordinates: makeBayPolygon(28.460100, 77.026750),
            status: 'OCCUPIED'
        },
        {
            bayCode: 'BAY-009',
            bayName: 'Zone B Bay 3',
            zone: 'Zone B',
            latitude: 28.460100,
            longitude: 77.026900,
            polygonCoordinates: makeBayPolygon(28.460100, 77.026900),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-010',
            bayName: 'Zone B Bay 4',
            zone: 'Zone B',
            latitude: 28.460100,
            longitude: 77.027050,
            polygonCoordinates: makeBayPolygon(28.460100, 77.027050),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-011',
            bayName: 'Zone B Bay 5',
            zone: 'Zone B',
            latitude: 28.460100,
            longitude: 77.027200,
            polygonCoordinates: makeBayPolygon(28.460100, 77.027200),
            status: 'OCCUPIED'
        },
        {
            bayCode: 'BAY-012',
            bayName: 'Zone B Bay 6',
            zone: 'Zone B',
            latitude: 28.460100,
            longitude: 77.027350,
            polygonCoordinates: makeBayPolygon(28.460100, 77.027350),
            status: 'AVAILABLE'
        },

        // ── Zone C ────────────────────────────────────────────────────────────
        {
            bayCode: 'BAY-013',
            bayName: 'Zone C Bay 1',
            zone: 'Zone C',
            latitude: 28.460700,
            longitude: 77.026600,
            polygonCoordinates: makeBayPolygon(28.460700, 77.026600),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-014',
            bayName: 'Zone C Bay 2',
            zone: 'Zone C',
            latitude: 28.460700,
            longitude: 77.026750,
            polygonCoordinates: makeBayPolygon(28.460700, 77.026750),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-015',
            bayName: 'Zone C Bay 3',
            zone: 'Zone C',
            latitude: 28.460700,
            longitude: 77.026900,
            polygonCoordinates: makeBayPolygon(28.460700, 77.026900),
            status: 'INACTIVE'
        },
        {
            bayCode: 'BAY-016',
            bayName: 'Zone C Bay 4',
            zone: 'Zone C',
            latitude: 28.460700,
            longitude: 77.027050,
            polygonCoordinates: makeBayPolygon(28.460700, 77.027050),
            status: 'AVAILABLE'
        },
        {
            bayCode: 'BAY-017',
            bayName: 'Zone C Bay 5',
            zone: 'Zone C',
            latitude: 28.460700,
            longitude: 77.027200,
            polygonCoordinates: makeBayPolygon(28.460700, 77.027200),
            status: 'OCCUPIED'
        },
        {
            bayCode: 'BAY-018',
            bayName: 'Zone C Bay 6',
            zone: 'Zone C',
            latitude: 28.460700,
            longitude: 77.027350,
            polygonCoordinates: makeBayPolygon(28.460700, 77.027350),
            status: 'AVAILABLE'
        },
    ];

    // Bays: upsert so you can run this seed repeatedly without duplicates
    for (const bay of bays) {
        await prisma.bay.upsert({
            where: { bayCode: bay.bayCode },
            update: {
                bayName: bay.bayName,
                zone: bay.zone,
                latitude: bay.latitude,
                longitude: bay.longitude,
                polygonCoordinates: bay.polygonCoordinates,
                status: bay.status,
            },
            create: bay,
        });
    }

    console.log(`✅ Bays seeded/upserted: ${bays.length}`);

    // ── Materials ────────────────────────────────────────────────────────────
    const materials = [
        {
            materialCode: 'MAT-001',
            materialName: 'Steel Coil',
            materialType: 'RAW_MATERIAL',
            manufacturer: 'Tata Steel',
            supplier: 'ABC Industrial Suppliers',
            description: 'Steel coil used for warehouse testing',
            status: 'ACTIVE'
        },
        {
            materialCode: 'MAT-002',
            materialName: 'Copper Rod',
            materialType: 'RAW_MATERIAL',
            manufacturer: 'Hindalco',
            supplier: 'ABC Industrial Suppliers',
            description: 'Copper rod used for warehouse testing',
            status: 'ACTIVE'
        },
        {
            materialCode: 'MAT-003',
            materialName: 'Aluminium Sheet',
            materialType: 'RAW_MATERIAL',
            manufacturer: 'Hindalco',
            supplier: 'XYZ Metals',
            description: 'Aluminium sheet used for warehouse testing',
            status: 'ACTIVE'
        },
        {
            materialCode: 'MAT-004',
            materialName: 'Industrial Pipe',
            materialType: 'FINISHED_GOODS',
            manufacturer: 'Jindal',
            supplier: 'Prime Supplies',
            description: 'Industrial pipe used for warehouse testing',
            status: 'ACTIVE'
        },
        {
            materialCode: 'MAT-005',
            materialName: 'Metal Plate',
            materialType: 'SEMI_FINISHED',
            manufacturer: 'JSW',
            supplier: 'Prime Supplies',
            description: 'Metal plate used for warehouse testing',
            status: 'ACTIVE'
        }
    ];

    const materialLotMap = new Map();

    for (const material of materials) {
        const upsertedMaterial = await prisma.material.upsert({
            where: { materialCode: material.materialCode },
            update: {
                materialName: material.materialName,
                materialType: material.materialType,
                manufacturer: material.manufacturer,
                supplier: material.supplier,
                description: material.description,
                status: material.status,
            },
            create: material,
        });

        materialLotMap.set(material.materialCode, upsertedMaterial.id);
    }

    console.log(`✅ Materials seeded/upserted: ${materials.length}`);

    // ── Material Lots ────────────────────────────────────────────────────────
    const lots = [
        // MAT-001
        { lotCode: 'MAT-001-LOT-001', materialCode: 'MAT-001', quantity: 120, unit: 'KG', status: 'AVAILABLE' },
        { lotCode: 'MAT-001-LOT-002', materialCode: 'MAT-001', quantity: 150, unit: 'KG', status: 'AVAILABLE' },
        { lotCode: 'MAT-001-LOT-003', materialCode: 'MAT-001', quantity: 180, unit: 'KG', status: 'AVAILABLE' },

        // MAT-002
        { lotCode: 'MAT-002-LOT-001', materialCode: 'MAT-002', quantity: 90, unit: 'KG', status: 'AVAILABLE' },
        { lotCode: 'MAT-002-LOT-002', materialCode: 'MAT-002', quantity: 110, unit: 'KG', status: 'AVAILABLE' },
        { lotCode: 'MAT-002-LOT-003', materialCode: 'MAT-002', quantity: 130, unit: 'KG', status: 'AVAILABLE' },

        // MAT-003
        { lotCode: 'MAT-003-LOT-001', materialCode: 'MAT-003', quantity: 75, unit: 'SHEETS', status: 'AVAILABLE' },
        { lotCode: 'MAT-003-LOT-002', materialCode: 'MAT-003', quantity: 95, unit: 'SHEETS', status: 'AVAILABLE' },
        { lotCode: 'MAT-003-LOT-003', materialCode: 'MAT-003', quantity: 115, unit: 'SHEETS', status: 'AVAILABLE' },

        // MAT-004
        { lotCode: 'MAT-004-LOT-001', materialCode: 'MAT-004', quantity: 60, unit: 'PCS', status: 'AVAILABLE' },
        { lotCode: 'MAT-004-LOT-002', materialCode: 'MAT-004', quantity: 80, unit: 'PCS', status: 'AVAILABLE' },
        { lotCode: 'MAT-004-LOT-003', materialCode: 'MAT-004', quantity: 100, unit: 'PCS', status: 'AVAILABLE' },

        // MAT-005
        { lotCode: 'MAT-005-LOT-001', materialCode: 'MAT-005', quantity: 50, unit: 'PCS', status: 'AVAILABLE' },
        { lotCode: 'MAT-005-LOT-002', materialCode: 'MAT-005', quantity: 70, unit: 'PCS', status: 'AVAILABLE' },
        { lotCode: 'MAT-005-LOT-003', materialCode: 'MAT-005', quantity: 90, unit: 'PCS', status: 'AVAILABLE' },
    ];

    for (const lot of lots) {
        await prisma.materialLot.upsert({
            where: { lotCode: lot.lotCode },
            update: {
                materialId: materialLotMap.get(lot.materialCode),
                quantity: lot.quantity,
                unit: lot.unit,
                status: lot.status,
                receivedDate: new Date(),
            },
            create: {
                lotCode: lot.lotCode,
                materialId: materialLotMap.get(lot.materialCode),
                quantity: lot.quantity,
                unit: lot.unit,
                status: lot.status,
                receivedDate: new Date(),
                qrStatus: 'UNGENERATED',
                qrVersion: 1,
            },
        });
    }

    console.log(`✅ Lots seeded/upserted: ${lots.length}`);
    console.log('🎉 Seed complete — bays, materials, and lots are ready.');
}

main()
    .catch((error) => {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });