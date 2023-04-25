model TypesTest {
    prefix "tt"

    field string: String
    field integer: Int
    field decimal: Decimal
    field optional: Optional[Int]
    field boolean: Bool

    // Test comment
    state Created {}

    transition Create: Created {
        field string: String // Test comment on a field
        field integer: Int
        field decimal: Decimal
        field optional: Optional[Int]
        field boolean: Bool
    }
}

model StateWithNonNullableField {
    prefix "swnnf"

    state Created {}
    state Finished {
        field result: String
    }

    transition Create: Created {}
    transition Finish: Created -> Finished {
        field result: String
    }
}