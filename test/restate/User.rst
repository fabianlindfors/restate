model User {
    prefix "user"

    field name: String
    field duplicateTransition: Optional[String]

    state Created {
        field nickname: Optional[String]
        field age: Optional[Int]
    }
    state Deleted {}

    transition Create: Created {}
    transition CreateExtra: Created {}
    transition CreateWithData: Created {
        field nickname: String
        field age: Int
    }
    transition Delete: Created -> Deleted {}
    transition CreateDouble: Created {}

}